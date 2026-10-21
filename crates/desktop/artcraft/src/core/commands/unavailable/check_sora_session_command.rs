use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// Sora needed an account outside publik. This build answers with one sentence and no network.
#[tauri::command]
pub fn check_sora_session_command() -> UnavailableResponse {
  info!("check_sora_session_command called; Sora is not in this build");
  unavailable("Sora")
}
