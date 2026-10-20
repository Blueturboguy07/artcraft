use log::debug;
use tauri::State;

use crate::core::commands::response::shorthand::InfallibleResponse;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

/// "Dismiss" on the result bar's notice.
#[tauri::command]
pub fn publik_dismiss_notice_command(publik: State<'_, PublikAiState>) -> InfallibleResponse<PublikStatus> {
  debug!("publik_dismiss_notice_command called");
  publik.dismiss_notice();
  publik.status().into()
}
