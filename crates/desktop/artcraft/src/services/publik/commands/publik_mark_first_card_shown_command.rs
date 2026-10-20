use log::{error, info};
use tauri::State;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

/// The card with the balance line and the cost sentence is on screen. It shows once.
#[tauri::command]
pub async fn publik_mark_first_card_shown_command(publik: State<'_, PublikAiState>) -> ResponseOrErrorMessage<PublikStatus> {
  info!("publik_mark_first_card_shown_command called");
  publik.mark_first_card_shown().map_err(|message| {
    error!("Could not save the AI setup state: {}", message);
    message
  })?;
  Ok(publik.status().into())
}
