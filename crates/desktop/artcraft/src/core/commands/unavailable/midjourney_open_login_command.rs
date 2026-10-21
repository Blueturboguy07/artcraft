use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// Midjourney needed an account outside publik. This build answers with one sentence and no network.
#[tauri::command]
pub fn midjourney_open_login_command() -> UnavailableResponse {
  info!("midjourney_open_login_command called; Midjourney is not in this build");
  unavailable("Midjourney")
}
