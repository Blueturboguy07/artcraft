use log::debug;

use crate::core::commands::generate::models::empty_model_list::EmptyModelList;
use crate::core::commands::response::shorthand::InfallibleResponse;

/// An empty list, with no network. The frontend keeps its own built-in model list.
#[tauri::command]
pub fn list_image_models_command() -> InfallibleResponse<EmptyModelList> {
  debug!("list_image_models_command called");
  EmptyModelList::new().into()
}
