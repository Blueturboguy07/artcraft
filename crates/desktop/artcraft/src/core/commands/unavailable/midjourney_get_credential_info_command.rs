use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// Midjourney needed an account outside publik. This build answers with one sentence and no network.
#[tauri::command]
pub fn midjourney_get_credential_info_command() -> UnavailableResponse {
  info!("midjourney_get_credential_info_command called; Midjourney is not in this build");
  unavailable("Midjourney")
}
