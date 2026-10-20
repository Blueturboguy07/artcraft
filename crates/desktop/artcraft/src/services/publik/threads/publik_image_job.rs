//! The background half of a publik API image request.
//!
//! The job calls publik API (blocking, through the system `curl`), keeps each image as a PNG in
//! `~/Artcraft/downloads/publik`, and then completes the task the way other providers do:
//!
//! - Signed in to ArtCraft: the images are uploaded into the ArtCraft library (with the prompt)
//!   and the task completes through `notify_frontend_of_completion`, exactly like fal results.
//! - Not signed in: the task completes with the local files. The feed shows them through the
//!   same completion events, with `asset:` URLs to the PNGs on disk.

use std::path::{Path, PathBuf};

use artcraft_api_defs::prompts::create_prompt::CreatePromptRequest;
use artcraft_api_defs::utils::media_links_to_thumbnail_template::media_links_to_thumbnail_template;
use artcraft_client::credentials::storyteller_credential_set::StorytellerCredentialSet;
use artcraft_client::endpoints::media_files::get_media_file::get_media_file;
use artcraft_client::endpoints::media_files::upload_image_media_file_from_file::{upload_image_media_file_from_file, UploadImageFromFileArgs};
use artcraft_client::endpoints::prompts::create_prompt::create_prompt;
use craft_publik::client;
use enums::common::generation::common_model_type::CommonModelType;
use enums::common::generation_provider::GenerationProvider;
use enums::tauri::tasks::task_failure_type::TaskFailureType;
use enums::tauri::tasks::task_media_file_class::TaskMediaFileClass;
use enums::tauri::tasks::task_model_type::TaskModelType;
use enums::tauri::tasks::task_status::TaskStatus;
use enums::tauri::tasks::task_type::TaskType;
use enums::tauri::ux::tauri_command_caller::TauriCommandCaller;
use anyhow::anyhow;
use errors::AnyhowResult;
use image::ImageFormat;
use log::{error, info, warn};
use sqlite_tasks::queries::task::Task;
use sqlite_tasks::queries::update_successful_task_status_with_metadata::{update_successful_task_status_with_metadata, UpdateSuccessfulTaskArgs};
use sqlite_tasks::queries::update_task_status_with_rich_failure::{update_task_status_with_rich_failure, UpdateTaskWithRichFailureArgs};
use tauri::{AppHandle, Manager};
use tokens::tokens::batch_generations::BatchGenerationToken;
use tokens::tokens::media_files::MediaFileToken;
use tokens::tokens::sqlite::tasks::TaskId;
use url::Url;
use uuid_utils::uuid::generate_random_uuid;

use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::functional_events::text_to_image_generation_complete_event::{GeneratedImage, TextToImageGenerationCompleteEvent};
use crate::core::events::generation_events::common::{GenerationAction, GenerationModel, GenerationServiceProvider};
use crate::core::events::generation_events::generation_complete_event::GenerationCompleteEvent;
use crate::core::events::generation_events::generation_failed_event::GenerationFailedEvent;
use crate::core::state::app_env_configs::app_env_configs::AppEnvConfigs;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use crate::core::state::task_database::TaskDatabase;
use crate::core::threads::third_party_task_polling_thread::events::notify_frontend_of_completion::{notify_frontend_of_completion, CompletionData};
use crate::core::utils::auto_download::{auto_download_task, clear_auto_download_checkpoint};
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_image_size::PublikImageSize;
use crate::services::storyteller::state::storyteller_credential_manager::StorytellerCredentialManager;

/// Under the app's downloads directory (`~/Artcraft/downloads`).
pub const PUBLIK_IMAGE_DIR: &str = "publik";

/// The task database trims failure messages at 255 bytes; trim on a character boundary first.
const MAX_FAILURE_MESSAGE_BYTES: usize = 250;

pub struct PublikImageJob {
  pub task_id: TaskId,
  pub task_type: TaskType,
  pub prompt: String,
  pub size: PublikImageSize,
  pub count: u32,
  pub maybe_edit_source: Option<PublikEditSource>,
  pub frontend_caller: Option<TauriCommandCaller>,
  pub frontend_subscriber_id: Option<String>,
  pub frontend_subscriber_payload: Option<String>,
}

/// The one image an edit starts from.
pub enum PublikEditSource {
  /// Canvas pixels (PNG, JPEG or WebP).
  Bytes(Vec<u8>),
  /// An image in the ArtCraft library.
  MediaFile(MediaFileToken),
}

pub async fn run_publik_image_job(app: AppHandle, job: PublikImageJob) {
  let task = job.task();
  info!("[publik] Task {} started: {} image(s), {}", task.id.as_str(), job.count, job.size.as_size());
  match make_images(&app, &job).await {
    Ok(paths) => complete(&app, &task, &job, &paths).await,
    Err(message) => fail(&app, &task, &message).await,
  }
}

impl PublikImageJob {
  /// The task row as `create_task` wrote it.
  fn task(&self) -> Task {
    Task { id: self.task_id.clone(), status: TaskStatus::Pending, task_type: self.task_type, model_type: Some(TaskModelType::GptImage1), provider: GenerationProvider::Publik, provider_job_id: None, queue_status_url: None, queue_response_url: None, prompt_token: None, frontend_caller: self.frontend_caller, frontend_subscriber_id: self.frontend_subscriber_id.clone(), frontend_subscriber_payload: self.frontend_subscriber_payload.clone() }
  }
}

// ── Making the images ──

/// Ok: the PNGs on disk (at least one). Err: the message the feed shows.
async fn make_images(app: &AppHandle, job: &PublikImageJob) -> Result<Vec<PathBuf>, String> {
  let publik = app.state::<PublikAiState>().inner().clone();
  let root = app.state::<AppDataRoot>().inner().clone();
  let out_dir = root.downloads_dir().path().join(PUBLIK_IMAGE_DIR);
  std::fs::create_dir_all(&out_dir).map_err(|err| format!("ArtCraft could not create {}: {err}", out_dir.display()))?;

  let maybe_source_png = match &job.maybe_edit_source {
    None => None,
    Some(source) => Some(prepare_edit_source(app, source, &root, &job.task_id).await.map_err(|err| {
      warn!("[publik] Could not prepare the image to edit: {:?}", err);
      "ArtCraft could not read the image to edit. Try another image.".to_string()
    })?),
  };

  let provider = publik.provider();
  let prompt = job.prompt.clone();
  let size = job.size.as_size();
  let count = job.count;
  let file_stem = format!("publik_{}", job.task_id.as_str());
  let source = maybe_source_png.clone();

  let result = tauri::async_runtime::spawn_blocking(move || {
    let mut saved = Vec::new();
    let mut maybe_failure = None;
    for index in 1..=count {
      let reply = match &source {
        Some(path) => client::image_edit(&provider, &prompt, path, None, size),
        None => client::image_generate(&provider, &prompt, size),
      };
      match reply {
        Ok(reply) => {
          publik.note_reply(&reply);
          let path = out_dir.join(format!("{file_stem}_{index}.png"));
          if let Err(err) = std::fs::write(&path, &reply.bytes) {
            maybe_failure = Some(format!("ArtCraft could not save the image: {err}"));
            break;
          }
          saved.push(path);
        },
        Err(fail) => {
          info!("[publik] Image call failed (status {}, kind {})", fail.status, fail.kind);
          publik.note_fail(&fail);
          maybe_failure = Some(fail.message);
          break;
        },
      }
    }
    (saved, maybe_failure)
  })
  .await;

  if let Some(path) = maybe_source_png {
    let _ = std::fs::remove_file(path);
  }

  match result {
    Ok((saved, maybe_failure)) => match (saved.is_empty(), maybe_failure) {
      (true, maybe_failure) => Err(maybe_failure.unwrap_or_else(|| "publik API sent back no image.".to_string())),
      (false, Some(message)) => {
        warn!("[publik] Kept {} image(s); the next call failed: {}", saved.len(), message);
        Ok(saved)
      },
      (false, None) => Ok(saved),
    },
    Err(err) => {
      error!("[publik] Image thread failed: {:?}", err);
      Err("The request stopped unexpectedly. Try again.".to_string())
    },
  }
}

/// The gateway takes a PNG file. Canvas bytes and library images are converted first.
async fn prepare_edit_source(app: &AppHandle, source: &PublikEditSource, root: &AppDataRoot, task_id: &TaskId) -> AnyhowResult<PathBuf> {
  let bytes = match source {
    PublikEditSource::Bytes(bytes) => bytes.clone(),
    PublikEditSource::MediaFile(token) => {
      let config = app.state::<AppEnvConfigs>();
      let media_file = get_media_file(&config.storyteller_host, token).await?;
      let response = reqwest::get(media_file.media_file.media_links.cdn_url.clone()).await?.error_for_status()?;
      response.bytes().await?.to_vec()
    },
  };
  let path = root.temp_dir().path().join(format!("publik_edit_{}.png", task_id.as_str()));
  image::load_from_memory(&bytes)?.save_with_format(&path, ImageFormat::Png)?;
  Ok(path)
}

// ── Completing the task ──

async fn complete(app: &AppHandle, task: &Task, job: &PublikImageJob, paths: &[PathBuf]) {
  let maybe_creds = app.state::<StorytellerCredentialManager>().get_credentials().ok().flatten();
  if let Some(creds) = maybe_creds {
    match complete_in_library(app, task, job, paths, &creds).await {
      Ok(()) => return,
      Err(err) => warn!("[publik] Upload to the ArtCraft library failed; keeping the local copy: {:?}", err),
    }
  }
  if let Err(err) = complete_locally(app, task, paths).await {
    error!("[publik] Could not complete task {}: {:?}", task.id.as_str(), err);
  }
}

/// Signed in: the same path as fal results. Upload, record, then notify.
async fn complete_in_library(app: &AppHandle, task: &Task, job: &PublikImageJob, paths: &[PathBuf], creds: &StorytellerCredentialSet) -> AnyhowResult<()> {
  let config = app.state::<AppEnvConfigs>();
  let task_database = app.state::<TaskDatabase>();
  let host = &config.storyteller_host;

  let prompt_request = CreatePromptRequest { uuid_idempotency_token: generate_random_uuid(), positive_prompt: Some(job.prompt.clone()), negative_prompt: None, model_type: Some(CommonModelType::GptImage1), generation_provider: None, maybe_generation_mode: None, maybe_aspect_ratio: None, maybe_resolution: None, maybe_batch_count: u8::try_from(paths.len()).ok(), maybe_generate_audio: None, maybe_duration_seconds: None };
  let maybe_prompt_token = match create_prompt(host, Some(creds), prompt_request).await {
    Ok(response) => Some(response.prompt_token),
    Err(err) => {
      warn!("[publik] Could not record the prompt (failing open): {:?}", err);
      None
    },
  };

  let maybe_batch_token = (paths.len() > 1).then(BatchGenerationToken::generate);
  let mut uploaded = Vec::new();
  for path in paths {
    let response = upload_image_media_file_from_file(UploadImageFromFileArgs { api_host: host, maybe_creds: Some(creds), path, is_intermediate_system_file: false, maybe_prompt_token: maybe_prompt_token.as_ref(), maybe_generation_provider: None, maybe_batch_token: maybe_batch_token.as_ref() }).await?;
    uploaded.push(response.media_file_token);
  }
  let primary_token = uploaded.first().cloned().ok_or_else(|| anyhow!("No image was uploaded"))?;

  let mut maybe_cdn_url = None;
  let mut maybe_thumbnail_url_template = None;
  match get_media_file(host, &primary_token).await {
    Ok(response) => {
      maybe_thumbnail_url_template = media_links_to_thumbnail_template(&response.media_file.media_links).map(|s| s.to_string());
      maybe_cdn_url = Some(response.media_file.media_links.cdn_url);
    },
    Err(err) => warn!("[publik] Could not look up the uploaded image (failing open): {:?}", err),
  }

  // The local PNGs exist already; this copies the library files to the person's download folder
  // when "automatic downloads" is on, exactly as for other providers.
  let primary_url = maybe_cdn_url.as_ref().map(|url| url.to_string());
  if let Err(err) = auto_download_task(app, task, maybe_batch_token.as_ref(), primary_url.as_deref(), Some(uploaded.len())).await {
    warn!("[publik] Automatic download failed (failing open): {:?}", err);
  }

  let updated = update_successful_task_status_with_metadata(UpdateSuccessfulTaskArgs { db: task_database.get_connection(), task_id: &task.id, maybe_batch_token: maybe_batch_token.as_ref(), maybe_primary_media_file_token: Some(&primary_token), maybe_primary_media_file_class: Some(TaskMediaFileClass::Image), maybe_primary_media_file_cdn_url: primary_url.as_deref(), maybe_primary_media_file_thumbnail_url_template: maybe_thumbnail_url_template.as_deref() }).await?;

  if updated {
    clear_auto_download_checkpoint(app, task);
    let completion = CompletionData { primary_media_file_token: primary_token, maybe_cdn_url, maybe_thumbnail_url_template, maybe_batch_token, media_class: TaskMediaFileClass::Image };
    notify_frontend_of_completion(app, host, Some(creds), task, &completion).await;
  }
  info!("[publik] Task {} is in the ArtCraft library", task.id.as_str());
  Ok(())
}

/// Not signed in to ArtCraft: the PNGs on disk are the result.
async fn complete_locally(app: &AppHandle, task: &Task, paths: &[PathBuf]) -> AnyhowResult<()> {
  let images = paths
    .iter()
    .enumerate()
    .filter_map(|(index, path)| {
      let url = local_asset_url(path)?;
      let token = MediaFileToken::new_from_str(&format!("publik_{}_{}", task.id.as_str(), index + 1));
      Some((token, url))
    })
    .collect::<Vec<_>>();
  let (primary_token, primary_url) = images.first().cloned().ok_or_else(|| anyhow!("No local image URL"))?;

  let task_database = app.state::<TaskDatabase>();
  let primary_url_string = primary_url.to_string();
  let updated = update_successful_task_status_with_metadata(UpdateSuccessfulTaskArgs { db: task_database.get_connection(), task_id: &task.id, maybe_batch_token: None, maybe_primary_media_file_token: Some(&primary_token), maybe_primary_media_file_class: Some(TaskMediaFileClass::Image), maybe_primary_media_file_cdn_url: Some(&primary_url_string), maybe_primary_media_file_thumbnail_url_template: None }).await?;
  if !updated {
    return Ok(());
  }

  GenerationCompleteEvent { action: Some(GenerationAction::GenerateImage), service: GenerationServiceProvider::Publik, model: Some(GenerationModel::GptImage1) }.send_infallible(app);

  // The create pages and the canvas pages all listen for this event, keyed by subscriber id.
  TextToImageGenerationCompleteEvent { generated_images: images.into_iter().map(|(media_token, cdn_url)| GeneratedImage { media_token, cdn_url, maybe_thumbnail_template: None }).collect(), maybe_frontend_subscriber_id: task.frontend_subscriber_id.clone(), maybe_frontend_subscriber_payload: task.frontend_subscriber_payload.clone() }.send_infallible(app);
  info!("[publik] Task {} completed with local files", task.id.as_str());
  Ok(())
}

async fn fail(app: &AppHandle, task: &Task, message: &str) {
  let message = trim_to_char_boundary(message, MAX_FAILURE_MESSAGE_BYTES);
  let task_database = app.state::<TaskDatabase>();
  let result = update_task_status_with_rich_failure(UpdateTaskWithRichFailureArgs { db: task_database.get_connection(), task_id: &task.id, status: TaskStatus::CompleteFailure, maybe_failure_type: Some(TaskFailureType::GenerationFailed), maybe_failure_message: Some(message) }).await;
  if let Err(err) = result {
    error!("[publik] Could not record the failure of task {}: {:?}", task.id.as_str(), err);
  }
  GenerationFailedEvent { action: GenerationAction::GenerateImage, service: GenerationServiceProvider::Publik, model: Some(GenerationModel::GptImage1), reason: Some(message.to_string()) }.send_infallible(app);
}

/// The URL `convertFileSrc` makes for a local file: the webview loads it through Tauri's asset
/// protocol.
pub fn local_asset_url(path: &Path) -> Option<Url> {
  let encoded = encode_uri_component(&path.to_string_lossy());
  let base = if cfg!(windows) { "http://asset.localhost/" } else { "asset://localhost/" };
  Url::parse(&format!("{base}{encoded}")).ok()
}

/// JavaScript's `encodeURIComponent`.
fn encode_uri_component(value: &str) -> String {
  let mut out = String::with_capacity(value.len());
  for byte in value.bytes() {
    match byte {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => out.push(char::from(byte)),
      other => out.push_str(&format!("%{other:02X}")),
    }
  }
  out
}

fn trim_to_char_boundary(value: &str, max_bytes: usize) -> &str {
  if value.len() <= max_bytes {
    return value;
  }
  let mut end = max_bytes;
  while !value.is_char_boundary(end) {
    end -= 1;
  }
  &value[..end]
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn local_files_load_through_the_asset_protocol() {
    let url = local_asset_url(Path::new("/Users/a b/Artcraft/downloads/publik/publik_1.png")).unwrap();
    if cfg!(windows) {
      assert!(url.as_str().starts_with("http://asset.localhost/"));
    } else {
      assert_eq!(url.as_str(), "asset://localhost/%2FUsers%2Fa%20b%2FArtcraft%2Fdownloads%2Fpublik%2Fpublik_1.png");
    }
  }

  #[test]
  fn failure_messages_are_trimmed_on_a_character_boundary() {
    let message = "·".repeat(200);
    let trimmed = trim_to_char_boundary(&message, MAX_FAILURE_MESSAGE_BYTES);
    assert!(trimmed.len() <= MAX_FAILURE_MESSAGE_BYTES);
    assert!(trimmed.chars().all(|c| c == '·'));
    assert_eq!(trim_to_char_boundary("short", MAX_FAILURE_MESSAGE_BYTES), "short");
  }
}
