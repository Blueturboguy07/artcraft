use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

#[derive(Deserialize)]
pub struct PublikSetOwnKeyRequest {
  pub key: String,
  pub maybe_base_url: Option<String>,
  pub maybe_model: Option<String>,
}

#[derive(Serialize)]
pub struct PublikSetOwnKeyResponse {
  /// "The key works: 42 models available. Using gpt-4.1-mini."
  pub check_line: String,
  pub status: PublikStatus,
}

impl SerializeMarker for PublikSetOwnKeyResponse {}

/// "Check and use this key": the key goes to its own service once (`GET /models`), then into
/// ArtCraft's AI settings file. The key is never logged and never sent back.
#[tauri::command]
pub async fn publik_set_own_key_command(request: PublikSetOwnKeyRequest, publik: State<'_, PublikAiState>) -> ResponseOrErrorMessage<PublikSetOwnKeyResponse> {
  info!("publik_set_own_key_command called");
  let state = publik.inner().clone();
  let base_url = request.maybe_base_url.unwrap_or_default();
  let model = request.maybe_model.unwrap_or_default();
  let key = request.key;
  let result = tauri::async_runtime::spawn_blocking(move || state.set_own_key(&key, &base_url, &model)).await;
  match result {
    Ok(Ok(check)) => Ok(PublikSetOwnKeyResponse { check_line: format!("The key works: {} models available. Using {}.", check.model_count, check.model), status: publik.status() }.into()),
    Ok(Err(message)) => {
      info!("The own key was not accepted: {}", message);
      Err(message.into())
    },
    Err(err) => {
      error!("publik own-key thread failed: {:?}", err);
      Err("The key check stopped unexpectedly. Try again.".into())
    },
  }
}
