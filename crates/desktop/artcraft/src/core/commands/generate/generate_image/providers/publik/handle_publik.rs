//! publik API as the image provider: GPT Image 1 (the person's publik balance or their own
//! OpenAI key) or Nano Banana (publik API only). It needs no ArtCraft account.
//!
//! The request becomes a task in the local task database, so the feed shows it as pending at
//! once. A background job then makes the image(s) and completes the task with local files (see
//! `publik_image_job`).

use craft_publik::client::Fail;
use craft_publik::Line;
use enums::common::generation_provider::GenerationProvider;
use enums::tauri::tasks::task_type::TaskType;
use log::{error, info};
use tauri::{AppHandle, Manager};

use crate::core::commands::enqueue::task_enqueue_success::TaskEnqueueSuccess;
use crate::core::commands::generate::generate_image::tauri_generate_image_request::{TauriGenerateImageErrorType, TauriGenerateImageRequest, TauriGenerateImageResponse};
use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::Response;
use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::generation_events::generation_enqueue_success_event::GenerationEnqueueSuccessEvent;
use crate::core::state::task_database::TaskDatabase;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_image_model::PublikImageModel;
use crate::services::publik::state::publik_image_size::PublikImageSize;
use crate::services::publik::state::publik_local_store::PublikLocalStore;
use crate::services::publik::threads::publik_image_job::{run_publik_image_job, PublikEditSource, PublikImageJob};

/// Each image is one call (and one charge); four keeps a batch affordable.
const MAX_PUBLIK_IMAGES: u32 = 4;

const NANO_BANANA_NEEDS_PUBLIK: &str = "Nano Banana runs through publik API only in this app. Choose GPT Image 1, or switch to publik API in Options.";

type PublikImageError = CommandErrorResponseWrapper<TauriGenerateImageErrorType, ()>;

pub async fn handle_publik(request: &TauriGenerateImageRequest, model: PublikImageModel, app: &AppHandle) -> Response<TauriGenerateImageResponse, TauriGenerateImageErrorType, ()> {
  info!("generate_image_command: publik API, model {}", model.model_id());

  let job_input = check_request(request, model, &app.state::<PublikAiState>(), &app.state::<PublikLocalStore>())?;

  let success = TaskEnqueueSuccess { task_type: TaskType::ImageGeneration, model: Some(model.generation_model()), provider: GenerationProvider::Publik, provider_job_id: None, maybe_queue_status_url: None, maybe_queue_response_url: None, maybe_prompt_token: None };

  let task_database = app.state::<TaskDatabase>();
  let task_id = success.insert_into_task_database_with_frontend_payload(&task_database, request.frontend_caller, request.frontend_subscriber_id.as_deref(), request.frontend_subscriber_payload.as_deref()).await.map_err(|err| {
    error!("Could not record the publik task: {:?}", err);
    command_error(CommandErrorStatus::ServerError, TauriGenerateImageErrorType::ServerError, "ArtCraft could not record this request. Try again.")
  })?;

  GenerationEnqueueSuccessEvent { action: success.to_frontend_event_action(), service: success.to_frontend_event_service(), model: success.model }.send_infallible(app);

  let job = PublikImageJob { task_id, task_type: success.task_type, model, prompt: job_input.prompt, size: job_input.size, count: job_input.count, maybe_edit_source: job_input.maybe_edit_source, frontend_caller: request.frontend_caller, frontend_subscriber_id: request.frontend_subscriber_id.clone(), frontend_subscriber_payload: request.frontend_subscriber_payload.clone() };
  tauri::async_runtime::spawn(run_publik_image_job(app.clone(), job));

  Ok(TauriGenerateImageResponse {}.into())
}

/// The parts of the request the job needs, checked before a task exists.
struct PublikJobInput {
  prompt: String,
  size: PublikImageSize,
  count: u32,
  maybe_edit_source: Option<PublikEditSource>,
}

fn check_request(request: &TauriGenerateImageRequest, model: PublikImageModel, publik: &PublikAiState, store: &PublikLocalStore) -> Result<PublikJobInput, PublikImageError> {
  let provider = publik.provider();
  if !provider.is_set_up() {
    return Err(command_error(CommandErrorStatus::Unauthorized, TauriGenerateImageErrorType::NeedsPublikSetup, &Fail::not_set_up().message));
  }
  if !provider.supports(Line::Images) {
    return Err(bad_input(&Fail::unsupported(Line::Images).message));
  }
  if model == PublikImageModel::NanoBanana && !provider.is_publik() {
    return Err(bad_input(NANO_BANANA_NEEDS_PUBLIK));
  }
  let prompt = request.prompt.as_deref().unwrap_or_default().trim().to_string();
  if prompt.is_empty() {
    return Err(bad_input("Type a prompt first."));
  }
  if request.inpainting_mask_image_media_token.is_some() || request.inpainting_mask_image_raw_bytes.is_some() {
    return Err(bad_input("publik API does not take a painted mask. Remove the mask and describe the change in the prompt."));
  }
  if request.scene_image_media_token.is_some() || request.scene_image_raw_bytes.is_some() {
    return Err(bad_input("publik API does not take a scene image. Remove the scene image and try again."));
  }

  // Nano Banana makes square images; GPT Image 1 takes the three gateway sizes.
  let size = match model {
    PublikImageModel::GptImage1 => PublikImageSize::from_aspect_ratio(request.aspect_ratio),
    PublikImageModel::NanoBanana => PublikImageSize::Square,
  };
  Ok(PublikJobInput { prompt, size, count: request.batch_size.unwrap_or(1).clamp(1, MAX_PUBLIK_IMAGES), maybe_edit_source: edit_source(request, store)? })
}

/// publik API edits one image. The canvas comes first, then the first reference image. A
/// reference is a local token (`publik_import_…`, or `publik_<task>_<n>` from a result).
fn edit_source(request: &TauriGenerateImageRequest, store: &PublikLocalStore) -> Result<Option<PublikEditSource>, PublikImageError> {
  let references = request.image_media_tokens.clone().unwrap_or_default();
  let canvas_count = usize::from(request.canvas_image_raw_bytes.is_some()) + usize::from(request.canvas_image_media_token.is_some());
  if canvas_count + references.len() > 1 {
    return Err(bad_input("publik API edits one image at a time. Keep one reference image and remove the others."));
  }
  if let Some(bytes) = &request.canvas_image_raw_bytes {
    return Ok(Some(PublikEditSource::Bytes(bytes.clone())));
  }
  let maybe_token = request.canvas_image_media_token.as_ref().or(references.first());
  match maybe_token {
    None => Ok(None),
    Some(token) => store.resolve_image(token.as_str()).map(|path| Some(PublikEditSource::File(path))).map_err(|message| bad_input(&message)),
  }
}

fn bad_input(message: &str) -> PublikImageError {
  command_error(CommandErrorStatus::BadRequest, TauriGenerateImageErrorType::BadInput, message)
}

fn command_error(status: CommandErrorStatus, error_type: TauriGenerateImageErrorType, message: &str) -> PublikImageError {
  CommandErrorResponseWrapper { status, error_message: Some(message.to_string()), error_type: Some(error_type), error_details: None }
}

#[cfg(test)]
mod tests {
  use super::*;
  use craft_publik::settings::{AiSettings, PROVIDER_OWN};
  use serde_json::json;

  use crate::services::publik::state::publik_local_store::NOT_LOCAL_MESSAGE;

  /// No publik credential file exists for this slug, so tests never read a real install.
  const TEST_SLUG: &str = "artcraft-unit-test-no-credential";

  #[test]
  fn references_resolve_to_local_files_and_cloud_tokens_get_the_sentence() {
    let (_dir, publik, store) = own_key_setup();
    let imported = store.import_image(&png_bytes()).unwrap();

    let input = check_request(&request(json!({"prompt": "bluer", "image_media_tokens": [imported.token]})), PublikImageModel::GptImage1, &publik, &store).ok().unwrap();
    match input.maybe_edit_source {
      Some(PublikEditSource::File(path)) => assert_eq!(path, imported.path),
      _ => panic!("expected a local file"),
    }

    let err = check_request(&request(json!({"prompt": "bluer", "image_media_tokens": ["mf_cloudtoken"]})), PublikImageModel::GptImage1, &publik, &store).err().unwrap();
    assert_eq!(err.error_message.as_deref(), Some(NOT_LOCAL_MESSAGE));
  }

  #[test]
  fn masks_and_nano_banana_on_an_own_key_get_sentences() {
    let (_dir, publik, store) = own_key_setup();
    let err = check_request(&request(json!({"prompt": "x", "inpainting_mask_image_raw_bytes": [1, 2]})), PublikImageModel::GptImage1, &publik, &store).err().unwrap();
    assert!(err.error_message.unwrap().starts_with("publik API does not take a painted mask."));
    let err = check_request(&request(json!({"prompt": "x"})), PublikImageModel::NanoBanana, &publik, &store).err().unwrap();
    assert_eq!(err.error_message.as_deref(), Some(NANO_BANANA_NEEDS_PUBLIK));
  }

  #[test]
  fn nothing_set_up_asks_for_the_setup_card() {
    let dir = tempfile::tempdir().unwrap();
    let publik = PublikAiState::new(app(dir.path()));
    let store = PublikLocalStore::new(dir.path());
    let err = check_request(&request(json!({"prompt": "x"})), PublikImageModel::GptImage1, &publik, &store).err().unwrap();
    assert!(matches!(err.status, CommandErrorStatus::Unauthorized));
    assert!(matches!(err.error_type, Some(TauriGenerateImageErrorType::NeedsPublikSetup)));
  }

  fn own_key_setup() -> (tempfile::TempDir, PublikAiState, PublikLocalStore) {
    let dir = tempfile::tempdir().unwrap();
    let settings = AiSettings { provider: PROVIDER_OWN.into(), own_key: "sk-proj-test-key".into(), setup_done: true, ..Default::default() };
    settings.save(Some(&dir.path().join("ai.json"))).unwrap();
    let publik = PublikAiState::new(app(dir.path()));
    let store = PublikLocalStore::new(dir.path());
    (dir, publik, store)
  }

  fn app(dir: &std::path::Path) -> craft_publik::AppInfo {
    craft_publik::AppInfo { slug: TEST_SLUG, name: "ArtCraft", version: "0.0.0", app_token: "", dialects: &["images"], config_dir: Some(dir.to_path_buf()) }
  }

  fn request(value: serde_json::Value) -> TauriGenerateImageRequest {
    serde_json::from_value(value).unwrap()
  }

  fn png_bytes() -> Vec<u8> {
    let image = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(8, 8, image::Rgba([1, 2, 3, 255])));
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    bytes.into_inner()
  }
}
