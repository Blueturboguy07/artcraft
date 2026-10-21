use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// This build has no 3D world generation line on publik API. The command keeps its
/// name and answers with one sentence. It reads no arguments and makes no network call.
#[tauri::command]
pub fn enqueue_image_to_gaussian_command() -> UnavailableResponse {
  info!("enqueue_image_to_gaussian_command called; 3d world generation is not in this build");
  unavailable("3D world generation")
}
