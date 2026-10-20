use log::{error, info};
use tauri::State;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

/// "Later" or "Done" on the setup card. The first-run card does not open again.
#[tauri::command]
pub async fn publik_close_setup_command(publik: State<'_, PublikAiState>) -> ResponseOrErrorMessage<PublikStatus> {
  info!("publik_close_setup_command called");
  publik.close_setup().map_err(|message| {
    error!("Could not save the AI setup choice: {}", message);
    message
  })?;
  Ok(publik.status().into())
}
