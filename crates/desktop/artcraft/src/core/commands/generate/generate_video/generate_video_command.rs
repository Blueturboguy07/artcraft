use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// This build has no video generation line on publik API. The command keeps its
/// name and answers with one sentence. It reads no arguments and makes no network call.
#[tauri::command]
pub fn generate_video_command() -> UnavailableResponse {
  info!("generate_video_command called; video generation is not in this build");
  unavailable("Video generation")
}
