use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// World Labs needed an account outside publik. This build answers with one sentence and no network.
#[tauri::command]
pub fn worldlabs_get_credential_info_command() -> UnavailableResponse {
  info!("worldlabs_get_credential_info_command called; World Labs is not in this build");
  unavailable("World Labs")
}
