use log::debug;

use crate::core::commands::cost_estimate::zero_cost_estimate::ZeroCostEstimate;
use crate::core::commands::response::shorthand::InfallibleResponse;

/// Zero, with no network. It reads no arguments.
#[tauri::command]
pub fn estimate_mesh_cost_command() -> InfallibleResponse<ZeroCostEstimate> {
  debug!("estimate_mesh_cost_command called");
  ZeroCostEstimate::new().into()
}
