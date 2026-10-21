use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// This build has no audio generation line on publik API. The command keeps its
/// name and answers with one sentence. It reads no arguments and makes no network call.
#[tauri::command]
pub fn generate_audio_command() -> UnavailableResponse {
  info!("generate_audio_command called; audio generation is not in this build");
  unavailable("Audio generation")
}
