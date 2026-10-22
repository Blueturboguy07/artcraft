//! The background half of a publik API image request.
//!
//! The job calls publik API (blocking, through the system `curl`), keeps each image as a PNG in
//! `~/Artcraft/publik/results`, writes the task's sidecar, and completes the task with the local
//! files. Nothing goes to a cloud library: the feed shows the PNGs through `asset:` URLs.
//!
//! Every batch carries the local batch token `publik_batch_<task>`, and the completion event
//! carries one entry per image, so the UI shows all of them.

use std::path::{Path, PathBuf};

use chrono::Utc;
use craft_publik::client::{self, Fail, Reply};
use craft_publik::Provider;
use enums::common::generation_provider::GenerationProvider;
use enums::tauri::tasks::task_failure_type::TaskFailureType;
use enums::tauri::tasks::task_media_file_class::TaskMediaFileClass;
use enums::tauri::tasks::task_status::TaskStatus;
use enums::tauri::tasks::task_type::TaskType;
use enums::tauri::ux::tauri_command_caller::TauriCommandCaller;
use anyhow::anyhow;
use errors::AnyhowResult;
use image::{GenericImageView, ImageFormat};
use log::{error, info, warn};
use sqlite_tasks::queries::task::Task;
use sqlite_tasks::queries::update_successful_task_status_with_metadata::{update_successful_task_status_with_metadata, UpdateSuccessfulTaskArgs};
use sqlite_tasks::queries::update_task_status_with_rich_failure::{update_task_status_with_rich_failure, UpdateTaskWithRichFailureArgs};
use tauri::{AppHandle, Manager};
use tokens::tokens::batch_generations::BatchGenerationToken;
use tokens::tokens::media_files::MediaFileToken;
use tokens::tokens::sqlite::tasks::TaskId;
use url::Url;

use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::functional_events::text_to_image_generation_complete_event::{GeneratedImage, TextToImageGenerationCompleteEvent};
use crate::core::events::generation_events::common::{GenerationAction, GenerationServiceProvider};
use crate::core::events::generation_events::generation_complete_event::GenerationCompleteEvent;
use crate::core::events::generation_events::generation_failed_event::GenerationFailedEvent;
use crate::core::state::app_preferences::app_preferences_manager::AppPreferencesManager;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use crate::core::state::task_database::TaskDatabase;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_image_model::PublikImageModel;
use crate::services::publik::state::publik_image_size::PublikImageSize;
use crate::services::publik::state::publik_local_store::{PublikLocalStore, PublikResultFile, PublikResultRecord};
use crate::services::publik::utils::copy_to_download_dir::copy_to_download_dir;

/// The task database trims failure messages at 255 bytes; trim on a character boundary first.
const MAX_FAILURE_MESSAGE_BYTES: usize = 250;

pub struct PublikImageJob {
  pub task_id: TaskId,
  pub task_type: TaskType,
  pub model: PublikImageModel,
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
  /// A PNG in the publik directory: an imported image or an earlier result.
  File(PathBuf),
}

/// One image on disk.
struct SavedImage {
  token: String,
  path: PathBuf,
  width: u32,
  height: u32,
}

/// The edit source as a PNG file, and whether the job made it (and removes it afterwards).
struct SourceFile {
  path: PathBuf,
  temporary: bool,
}

pub async fn run_publik_image_job(app: AppHandle, job: PublikImageJob) {
  let task = job.task();
  info!("[publik] Task {} started: {} image(s), {}, {}", task.id.as_str(), job.count, job.model.model_id(), job.size.as_size());
  match make_images(&app, &job).await {
    Ok(images) => {
      if let Err(err) = complete(&app, &task, &job, &images).await {
        error!("[publik] Could not complete task {}: {:?}", task.id.as_str(), err);
      }
    },
    Err(message) => fail(&app, &task, job.model, &message).await,
  }
}

impl PublikImageJob {
  /// The task row as `create_task` wrote it.
  fn task(&self) -> Task {
    Task { id: self.task_id.clone(), status: TaskStatus::Pending, task_type: self.task_type, model_type: Some(self.model.task_model_type()), provider: GenerationProvider::Publik, provider_job_id: None, queue_status_url: None, queue_response_url: None, prompt_token: None, frontend_caller: self.frontend_caller, frontend_subscriber_id: self.frontend_subscriber_id.clone(), frontend_subscriber_payload: self.frontend_subscriber_payload.clone() }
  }
}

// ── Making the images ──

/// Ok: the PNGs on disk (at least one). Err: the message the feed shows.
async fn make_images(app: &AppHandle, job: &PublikImageJob) -> Result<Vec<SavedImage>, String> {
  let publik = app.state::<PublikAiState>().inner().clone();
  let store = app.state::<PublikLocalStore>().inner().clone();
  let root = app.state::<AppDataRoot>().inner().clone();
  let results_dir = store.results_dir();
  std::fs::create_dir_all(&results_dir).map_err(|err| {
    warn!("[publik] Could not create {}: {}", results_dir.display(), err);
    "ArtCraft could not save on this computer. Check the free disk space and try again.".to_string()
  })?;

  let maybe_source = match &job.maybe_edit_source {
    None => None,
    Some(source) => Some(prepare_edit_source(source, &root, &job.task_id).map_err(|err| {
      warn!("[publik] Could not prepare the image to edit: {:?}", err);
      "ArtCraft could not read the image to edit. Try another image.".to_string()
    })?),
  };

  let provider = publik.provider();
  let model = job.model;
  let prompt = job.prompt.clone();
  // publik API draws GPT Image 1 at 1024x1024 only; a person's own key has all three sizes.
  let size = if provider.is_publik() { PublikImageSize::Square.as_size() } else { job.size.as_size() };
  let count = job.count;
  let task_id = job.task_id.as_str().to_string();
  let source_path = maybe_source.as_ref().map(|source| source.path.clone());

  let result = tauri::async_runtime::spawn_blocking(move || {
    let mut saved = Vec::new();
    let mut maybe_failure = None;
    for index in 1..=count {
      match call_image_line(&provider, model, &prompt, size, source_path.as_deref()) {
        Ok(reply) => {
          publik.note_reply(&reply);
          let token = PublikLocalStore::result_token(&task_id, index as usize);
          let path = store.result_path(&token, "png");
          match save_as_png(&reply.bytes, &path) {
            Ok((width, height)) => saved.push(SavedImage { token, path, width, height }),
            Err(message) => {
              maybe_failure = Some(message);
              break;
            },
          }
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

  if let Some(source) = maybe_source.filter(|source| source.temporary) {
    let _ = std::fs::remove_file(source.path);
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

/// One call on the image line the model names. Blocking.
fn call_image_line(provider: &Provider, model: PublikImageModel, prompt: &str, size: &str, maybe_source: Option<&Path>) -> Result<Reply, Fail> {
  match (model, maybe_source) {
    (PublikImageModel::GptImage1, Some(source)) => client::image_edit(provider, prompt, source, None, size),
    (PublikImageModel::GptImage1, None) => client::image_generate(provider, prompt, size),
    (PublikImageModel::NanoBanana, Some(source)) => client::image_edit_nano(provider, prompt, source),
    (PublikImageModel::NanoBanana, None) => client::image_generate_nano(provider, prompt),
  }
}

/// The longest side of the image sent to the edit line. publik API draws 1024x1024, and the
/// gateway takes a request of a few megabytes at most, so a larger source is scaled down first.
const EDIT_SOURCE_LONG_EDGE: u32 = 1024;

/// The gateway takes a PNG file of at most [`EDIT_SOURCE_LONG_EDGE`] pixels on its long side.
/// A local PNG within that size goes as it is; canvas bytes and larger files become a temporary PNG.
fn prepare_edit_source(source: &PublikEditSource, root: &AppDataRoot, task_id: &TaskId) -> AnyhowResult<SourceFile> {
  let fits = |image: &image::DynamicImage| image.width() <= EDIT_SOURCE_LONG_EDGE && image.height() <= EDIT_SOURCE_LONG_EDGE;
  let image = match source {
    PublikEditSource::File(path) => {
      let image = image::open(path)?;
      if fits(&image) && image::ImageReader::open(path)?.with_guessed_format()?.format() == Some(ImageFormat::Png) {
        return Ok(SourceFile { path: path.clone(), temporary: false });
      }
      image
    },
    PublikEditSource::Bytes(bytes) => image::load_from_memory(bytes)?,
  };
  let image = if fits(&image) { image } else { image.thumbnail(EDIT_SOURCE_LONG_EDGE, EDIT_SOURCE_LONG_EDGE) };
  let path = root.temp_dir().path().join(format!("publik_edit_{}.png", task_id.as_str()));
  image.save_with_format(&path, ImageFormat::Png)?;
  Ok(SourceFile { path, temporary: true })
}

/// GPT Image 1 sends PNG; Nano Banana may send JPEG. Every result is kept as a PNG.
fn save_as_png(bytes: &[u8], path: &Path) -> Result<(u32, u32), String> {
  let image = image::load_from_memory(bytes).map_err(|_| "publik API sent back an image that ArtCraft cannot read. Try again.".to_string())?;
  let written = if image::guess_format(bytes).ok() == Some(ImageFormat::Png) { std::fs::write(path, bytes).map_err(|err| err.to_string()) } else { image.save_with_format(path, ImageFormat::Png).map_err(|err| err.to_string()) };
  written.map_err(|err| {
    warn!("[publik] Could not save {}: {}", path.display(), err);
    "ArtCraft could not save the image on this computer. Check the free disk space and try again.".to_string()
  })?;
  Ok(image.dimensions())
}

// ── Completing the task ──

/// The PNGs on disk are the result: write the sidecar, copy to the download folder when
/// "automatic downloads" is on, mark the task done, then tell the frontend.
async fn complete(app: &AppHandle, task: &Task, job: &PublikImageJob, images: &[SavedImage]) -> AnyhowResult<()> {
  let store = app.state::<PublikLocalStore>().inner().clone();
  let task_id = task.id.as_str();
  let batch_token = PublikLocalStore::batch_token(task_id);
  let first = images.first().ok_or_else(|| anyhow!("No image was saved"))?;

  let record = PublikResultRecord {
    task_id: task_id.to_string(),
    created_at: Utc::now(),
    model: job.model.result_model(),
    prompt: job.prompt.clone(),
    size: format!("{}x{}", first.width, first.height),
    maybe_voice: None,
    batch_token: batch_token.clone(),
    images: images.iter().map(|image| PublikResultFile { token: image.token.clone(), file: file_name(&image.path), path: image.path.clone() }).collect(),
    maybe_audio: None,
  };
  if let Err(message) = store.write_record(&record) {
    // Failing open: the images exist and the feed shows them; only the history misses them.
    warn!("[publik] Could not write the sidecar for task {}: {}", task_id, message);
  }

  auto_download(app, job.model, images);

  let generated_images = images
    .iter()
    .filter_map(|image| Some(GeneratedImage { media_token: MediaFileToken::new_from_str(&image.token), cdn_url: local_asset_url(&image.path)?, maybe_thumbnail_template: None }))
    .collect::<Vec<_>>();
  let primary = generated_images.first().ok_or_else(|| anyhow!("No local image URL"))?;
  let primary_url = primary.cdn_url.to_string();
  let batch = BatchGenerationToken::new_from_str(&batch_token);

  let task_database = app.state::<TaskDatabase>();
  let updated = update_successful_task_status_with_metadata(UpdateSuccessfulTaskArgs { db: task_database.get_connection(), task_id: &task.id, maybe_batch_token: Some(&batch), maybe_primary_media_file_token: Some(&primary.media_token), maybe_primary_media_file_class: Some(TaskMediaFileClass::Image), maybe_primary_media_file_cdn_url: Some(&primary_url), maybe_primary_media_file_thumbnail_url_template: None }).await?;
  if !updated {
    return Ok(());
  }

  GenerationCompleteEvent { action: Some(GenerationAction::GenerateImage), service: GenerationServiceProvider::Publik, model: Some(job.model.generation_model()) }.send_infallible(app);

  // The create pages and the canvas pages all listen for this event, keyed by subscriber id.
  TextToImageGenerationCompleteEvent { generated_images, maybe_frontend_subscriber_id: task.frontend_subscriber_id.clone(), maybe_frontend_subscriber_payload: task.frontend_subscriber_payload.clone() }.send_infallible(app);
  info!("[publik] Task {} completed with {} local file(s)", task_id, images.len());
  Ok(())
}

/// "Automatic downloads" copies each result into the person's download folder. Failing open.
fn auto_download(app: &AppHandle, model: PublikImageModel, images: &[SavedImage]) {
  let prefs = match app.state::<AppPreferencesManager>().get_clone() {
    Ok(prefs) => prefs,
    Err(err) => {
      warn!("[publik] Could not read the preferences for automatic downloads: {:?}", err);
      return;
    },
  };
  if !prefs.auto_download {
    return;
  }
  let files = images.iter().map(|image| image.path.clone()).collect::<Vec<_>>();
  if let Err(err) = copy_to_download_dir(&app.state::<AppDataRoot>(), &prefs, model.model_id(), &files) {
    warn!("[publik] Automatic download failed: {:?}", err);
  }
}

async fn fail(app: &AppHandle, task: &Task, model: PublikImageModel, message: &str) {
  let message = trim_to_char_boundary(message, MAX_FAILURE_MESSAGE_BYTES);
  let task_database = app.state::<TaskDatabase>();
  let result = update_task_status_with_rich_failure(UpdateTaskWithRichFailureArgs { db: task_database.get_connection(), task_id: &task.id, status: TaskStatus::CompleteFailure, maybe_failure_type: Some(TaskFailureType::GenerationFailed), maybe_failure_message: Some(message) }).await;
  if let Err(err) = result {
    error!("[publik] Could not record the failure of task {}: {:?}", task.id.as_str(), err);
  }
  GenerationFailedEvent { action: GenerationAction::GenerateImage, service: GenerationServiceProvider::Publik, model: Some(model.generation_model()), reason: Some(message.to_string()) }.send_infallible(app);
}

/// The URL `convertFileSrc` makes for a local file: the webview loads it through Tauri's asset
/// protocol.
pub fn local_asset_url(path: &Path) -> Option<Url> {
  let encoded = encode_uri_component(&path.to_string_lossy());
  let base = if cfg!(windows) { "http://asset.localhost/" } else { "asset://localhost/" };
  Url::parse(&format!("{base}{encoded}")).ok()
}

/// The file behind a URL that `local_asset_url` made, or `None` for any other URL.
pub fn local_asset_path(url: &Url) -> Option<PathBuf> {
  let encoded = match (url.scheme(), url.host_str()) {
    ("asset", Some("localhost")) | ("http" | "https", Some("asset.localhost")) => url.path().strip_prefix('/')?,
    _ => return None,
  };
  let decoded = percent_decode(encoded)?;
  (!decoded.is_empty()).then(|| PathBuf::from(decoded))
}

pub fn file_name(path: &Path) -> String {
  path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()
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

fn percent_decode(value: &str) -> Option<String> {
  let bytes = value.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut index = 0;
  while index < bytes.len() {
    if bytes[index] == b'%' {
      let hex = std::str::from_utf8(bytes.get(index + 1..index + 3)?).ok()?;
      out.push(u8::from_str_radix(hex, 16).ok()?);
      index += 3;
    } else {
      out.push(bytes[index]);
      index += 1;
    }
  }
  String::from_utf8(out).ok()
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
  use image::{ImageBuffer, Rgb};

  #[test]
  fn local_files_load_through_the_asset_protocol() {
    let url = local_asset_url(Path::new("/Users/a b/Artcraft/publik/results/publik_1.png")).unwrap();
    if cfg!(windows) {
      assert!(url.as_str().starts_with("http://asset.localhost/"));
    } else {
      assert_eq!(url.as_str(), "asset://localhost/%2FUsers%2Fa%20b%2FArtcraft%2Fpublik%2Fresults%2Fpublik_1.png");
    }
  }

  #[test]
  fn asset_urls_turn_back_into_paths() {
    let path = Path::new("/Users/a b/Artcraft/publik/results/publik_task_1_1.png");
    assert_eq!(local_asset_path(&local_asset_url(path).unwrap()).as_deref(), Some(path));
    assert_eq!(local_asset_path(&Url::parse("https://cdn.example.com/a.png").unwrap()), None);
  }

  #[test]
  fn failure_messages_are_trimmed_on_a_character_boundary() {
    let message = "·".repeat(200);
    let trimmed = trim_to_char_boundary(&message, MAX_FAILURE_MESSAGE_BYTES);
    assert!(trimmed.len() <= MAX_FAILURE_MESSAGE_BYTES);
    assert!(trimmed.chars().all(|c| c == '·'));
    assert_eq!(trim_to_char_boundary("short", MAX_FAILURE_MESSAGE_BYTES), "short");
  }

  #[test]
  fn a_jpeg_result_is_kept_as_a_png() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("publik_task_1_1.png");
    let image = image::DynamicImage::ImageRgb8(ImageBuffer::from_pixel(6, 4, Rgb([10, 200, 10])));
    let mut jpeg = std::io::Cursor::new(Vec::new());
    image.write_to(&mut jpeg, ImageFormat::Jpeg).unwrap();
    assert_eq!(save_as_png(&jpeg.into_inner(), &path).unwrap(), (6, 4));
    assert_eq!(image::guess_format(&std::fs::read(&path).unwrap()).unwrap(), ImageFormat::Png);
    assert!(save_as_png(b"not an image", &path).unwrap_err().starts_with("publik API sent back an image"));
  }
}
