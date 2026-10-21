use log::info;

use crate::core::commands::unavailable::unavailable_response::{unavailable, UnavailableResponse};

/// This build has no 3D model generation line on publik API. The command keeps its
/// name and answers with one sentence. It reads no arguments and makes no network call.
#[tauri::command]
pub fn generate_mesh_command() -> UnavailableResponse {
  info!("generate_mesh_command called; 3d model generation is not in this build");
  unavailable("3D model generation")
}
