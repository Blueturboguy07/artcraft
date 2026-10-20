use log::debug;
use tauri::State;

use crate::core::commands::response::shorthand::InfallibleResponse;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

/// What the setup card, the settings block and the result bar show. Never a key.
#[tauri::command]
pub fn publik_get_status_command(publik: State<'_, PublikAiState>) -> InfallibleResponse<PublikStatus> {
  debug!("publik_get_status_command called");
  publik.status().into()
}
