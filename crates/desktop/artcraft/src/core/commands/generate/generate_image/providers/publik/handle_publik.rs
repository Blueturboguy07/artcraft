//! publik API as an image provider: GPT Image 1 through the person's publik balance or their
//! own OpenAI key. It needs no ArtCraft account.
//!
//! The request becomes a task in the local task database, like every other provider's, so the
//! feed shows it as pending at once. A background job then makes the image(s) and completes the
//! task through the same completion path the other providers use (see `publik_image_job`).

use craft_publik::client::Fail;
use craft_publik::Line;
use enums::common::generation_provider::GenerationProvider;
use enums::tauri::tasks::task_type::TaskType;
use log::{error, info};
use tauri::{AppHandle, Manager};

use crate::core::commands::enqueue::task_enqueue_success::TaskEnqueueSuccess;
use crate::core::commands::generate::generate_image::tauri_generate_image_request::{TauriGenerateImageErrorType, TauriGenerateImageRequest, TauriGenerateImageResponse};
use crate::core::commands::generate::generate_image::tauri_image_model::TauriImageModel;
use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::Response;
use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::generation_events::common::GenerationModel;
use crate::core::events::generation_events::generation_enqueue_success_event::GenerationEnqueueSuccessEvent;
use crate::core::state::task_database::TaskDatabase;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_image_size::PublikImageSize;
use crate::services::publik::threads::publik_image_job::{run_publik_image_job, PublikEditSource, PublikImageJob};

/// Each image is one call (and one charge); four keeps a batch affordable.
const MAX_PUBLIK_IMAGES: u32 = 4;

pub async fn handle_publik(request: &TauriGenerateImageRequest, app: &AppHandle) -> Response<TauriGenerateImageResponse, TauriGenerateImageErrorType, ()> {
  info!("generate_image_command: publik API, model {:?}", request.model);

  let job_input = check_request(request, &app.state::<PublikAiState>())?;

  let success = TaskEnqueueSuccess { task_type: TaskType::ImageGeneration, model: Some(GenerationModel::GptImage1), provider: GenerationProvider::Publik, provider_job_id: None, maybe_queue_status_url: None, maybe_queue_response_url: None, maybe_prompt_token: None };

  let task_database = app.state::<TaskDatabase>();
  let task_id = success.insert_into_task_database_with_frontend_payload(&task_database, request.frontend_caller, request.frontend_subscriber_id.as_deref(), request.frontend_subscriber_payload.as_deref()).await.map_err(|err| {
    error!("Could not record the publik task: {:?}", err);
    command_error(CommandErrorStatus::ServerError, TauriGenerateImageErrorType::ServerError, "ArtCraft could not record this request. Try again.")
  })?;

  GenerationEnqueueSuccessEvent { action: success.to_frontend_event_action(), service: success.to_frontend_event_service(), model: success.model }.send_infallible(app);

  let job = PublikImageJob { task_id, task_type: success.task_type, prompt: job_input.prompt, size: job_input.size, count: job_input.count, maybe_edit_source: job_input.maybe_edit_source, frontend_caller: request.frontend_caller, frontend_subscriber_id: request.frontend_subscriber_id.clone(), frontend_subscriber_payload: request.frontend_subscriber_payload.clone() };
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

fn check_request(request: &TauriGenerateImageRequest, publik: &PublikAiState) -> Result<PublikJobInput, CommandErrorResponseWrapper<TauriGenerateImageErrorType, ()>> {
  let provider = publik.provider();
  if !provider.is_set_up() {
    return Err(command_error(CommandErrorStatus::Unauthorized, TauriGenerateImageErrorType::NeedsPublikSetup, &Fail::not_set_up().message));
  }
  if !provider.supports(Line::Images) {
    return Err(command_error(CommandErrorStatus::BadRequest, TauriGenerateImageErrorType::BadInput, &Fail::unsupported(Line::Images).message));
  }
  if !matches!(request.model, None | Some(TauriImageModel::GptImage1)) {
    return Err(bad_input("publik API makes images with GPT Image 1. Choose that model, or another provider."));
  }
  let prompt = request.prompt.as_deref().unwrap_or_default().trim().to_string();
  if prompt.is_empty() {
    return Err(bad_input("Type a prompt first."));
  }
  if request.inpainting_mask_image_media_token.is_some() || request.inpainting_mask_image_raw_bytes.is_some() {
    return Err(bad_input("publik API does not take a mask in ArtCraft yet. Use the ArtCraft provider to paint an area."));
  }
  if request.scene_image_media_token.is_some() || request.scene_image_raw_bytes.is_some() {
    return Err(bad_input("publik API does not take a scene image in ArtCraft yet. Use the ArtCraft provider for scenes."));
  }

  Ok(PublikJobInput { prompt, size: PublikImageSize::from_aspect_ratio(request.aspect_ratio), count: request.batch_size.unwrap_or(1).clamp(1, MAX_PUBLIK_IMAGES), maybe_edit_source: edit_source(request)? })
}

/// publik API edits one image. The canvas comes first, then the first reference image.
fn edit_source(request: &TauriGenerateImageRequest) -> Result<Option<PublikEditSource>, CommandErrorResponseWrapper<TauriGenerateImageErrorType, ()>> {
  let references = request.image_media_tokens.clone().unwrap_or_default();
  let canvas_count = usize::from(request.canvas_image_raw_bytes.is_some()) + usize::from(request.canvas_image_media_token.is_some());
  if canvas_count + references.len() > 1 {
    return Err(bad_input("publik API edits one image at a time. Keep one reference image and remove the others."));
  }
  if let Some(bytes) = &request.canvas_image_raw_bytes {
    return Ok(Some(PublikEditSource::Bytes(bytes.clone())));
  }
  if let Some(token) = &request.canvas_image_media_token {
    return Ok(Some(PublikEditSource::MediaFile(token.clone())));
  }
  Ok(references.into_iter().next().map(PublikEditSource::MediaFile))
}

fn bad_input(message: &str) -> CommandErrorResponseWrapper<TauriGenerateImageErrorType, ()> {
  command_error(CommandErrorStatus::BadRequest, TauriGenerateImageErrorType::BadInput, message)
}

fn command_error(status: CommandErrorStatus, error_type: TauriGenerateImageErrorType, message: &str) -> CommandErrorResponseWrapper<TauriGenerateImageErrorType, ()> {
  CommandErrorResponseWrapper { status, error_message: Some(message.to_string()), error_type: Some(error_type), error_details: None }
}
