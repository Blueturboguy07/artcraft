use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// This build has no image to 3D line on publik API. The command keeps its
/// name and answers with one sentence. It reads no arguments and makes no network call.
#[tauri::command]
pub fn enqueue_image_to_3d_object_command() -> UnavailableResponse {
  info!("enqueue_image_to_3d_object_command called; image to 3d is not in this build");
  unavailable("Image to 3D")
}
