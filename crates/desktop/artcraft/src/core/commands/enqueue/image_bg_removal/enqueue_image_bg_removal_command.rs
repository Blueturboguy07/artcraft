use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// This build has no background removal line on publik API. The command keeps its
/// name and answers with one sentence. It reads no arguments and makes no network call.
#[tauri::command]
pub fn enqueue_image_bg_removal_command() -> UnavailableResponse {
  info!("enqueue_image_bg_removal_command called; background removal is not in this build");
  unavailable("Background removal")
}
