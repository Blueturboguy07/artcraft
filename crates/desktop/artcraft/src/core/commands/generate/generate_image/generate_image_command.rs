//! `generate_image_command`: every image goes through publik API (or the person's own key) via
//! `craft-publik`. There is no other provider and no fallback.
//!
//! The provider and the model are read from the raw request before it is parsed, so an unknown
//! provider or model id gets one plain sentence, never a parse error or a response body.

use log::{info, warn};
use serde_json::{Map, Value};
use tauri::AppHandle;

use crate::core::commands::generate::generate_image::providers::publik::handle_publik::handle_publik;
use crate::core::commands::generate::generate_image::tauri_generate_image_request::{TauriGenerateImageErrorType, TauriGenerateImageRequest, TauriGenerateImageResponse};
use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::Response;
use crate::services::publik::state::publik_image_model::PublikImageModel;

const UNREADABLE_REQUEST_MESSAGE: &str = "ArtCraft could not read this image request. Check the prompt and the options, and try again.";

type ImageCommandError = CommandErrorResponseWrapper<TauriGenerateImageErrorType, ()>;

/// The frontend sends `{ request: TauriGenerateImageRequest }` with `provider: "publik"` and
/// `model: "gpt_image_1" | "nano_banana"`.
#[tauri::command]
pub async fn generate_image_command(request: Map<String, Value>, app: AppHandle) -> Response<TauriGenerateImageResponse, TauriGenerateImageErrorType, ()> {
  info!("generate_image_command called");
  let (request, model) = route_image_request(request)?;
  handle_publik(&request, model, &app).await
}

/// Pick the publik image line, then parse the rest of the request.
pub fn route_image_request(fields: Map<String, Value>) -> Result<(TauriGenerateImageRequest, PublikImageModel), ImageCommandError> {
  let model = PublikImageModel::route(&fields).map_err(bad_input)?;
  let request = serde_json::from_value::<TauriGenerateImageRequest>(Value::Object(fields)).map_err(|err| {
    warn!("generate_image_command could not parse the request: {}", err);
    bad_input(UNREADABLE_REQUEST_MESSAGE)
  })?;
  Ok((request, model))
}

fn bad_input(message: &str) -> ImageCommandError {
  CommandErrorResponseWrapper { status: CommandErrorStatus::BadRequest, error_message: Some(message.to_string()), error_type: Some(TauriGenerateImageErrorType::BadInput), error_details: None }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  use crate::services::publik::state::publik_image_model::IMAGE_ROUTE_MESSAGE;

  #[test]
  fn other_providers_and_nano_banana_pro_get_one_sentence_and_no_body() {
    let cases = [
      json!({"provider": "artcraft", "model": "nano_banana_pro", "prompt": "a cat"}),
      json!({"provider": "fal", "model": "flux_pro_11", "prompt": "a cat"}),
      json!({"provider": "midjourney", "model": "midjourney", "prompt": "a cat"}),
      // The 401 regression: no provider and the default model used to reach ArtCraft's cloud.
      json!({"model": "nano_banana_pro", "prompt": "a cat"}),
      json!({"provider": "publik", "model": "nano_banana_pro", "prompt": "a cat"}),
    ];
    for case in cases {
      let err = route_image_request(case.as_object().unwrap().clone()).err().unwrap();
      let serialized = serde_json::to_value(&err).unwrap();
      assert_eq!(serialized, json!({"status": "bad_request", "error_type": "bad_input", "error_message": IMAGE_ROUTE_MESSAGE}), "{case}");
    }
  }

  #[test]
  fn publik_requests_parse_with_their_model() {
    let (request, model) = route_image_request(json!({"provider": "publik", "model": "nano_banana", "prompt": "a cat", "batch_size": 2}).as_object().unwrap().clone()).ok().unwrap();
    assert_eq!(model, PublikImageModel::NanoBanana);
    assert_eq!(request.prompt.as_deref(), Some("a cat"));
    assert_eq!(request.batch_size, Some(2));

    let err = route_image_request(json!({"provider": "publik", "model": "gpt_image_1", "batch_size": "two"}).as_object().unwrap().clone()).err().unwrap();
    assert_eq!(err.error_message.as_deref(), Some(UNREADABLE_REQUEST_MESSAGE));
  }
}
