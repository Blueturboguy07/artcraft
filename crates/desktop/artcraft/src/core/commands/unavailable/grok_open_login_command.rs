use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// Grok needed an account outside publik. This build answers with one sentence and no network.
#[tauri::command]
pub fn grok_open_login_command() -> UnavailableResponse {
  info!("grok_open_login_command called; Grok is not in this build");
  unavailable("Grok")
}
