use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// Sora needed an account outside publik. This build answers with one sentence and no network.
#[tauri::command]
pub fn sora_get_credential_info_command() -> UnavailableResponse {
  info!("sora_get_credential_info_command called; Sora is not in this build");
  unavailable("Sora")
}
