use log::{error, info};
use tauri::State;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

/// "Forget this computer's key" for publik API, or "Remove key" for the person's own key.
#[tauri::command]
pub async fn publik_forget_key_command(publik: State<'_, PublikAiState>) -> ResponseOrErrorMessage<PublikStatus> {
  info!("publik_forget_key_command called");
  publik.forget().map_err(|message| {
    error!("Could not forget the AI key: {}", message);
    message
  })?;
  Ok(publik.status().into())
}
