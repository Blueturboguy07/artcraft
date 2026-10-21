//! The model list commands answer an empty list with no network. The frontend keeps its own
//! built-in list of what publik API serves (GPT Image 1 and Nano Banana).

use serde_derive::Serialize;
use serde_json::Value;

use crate::core::commands::response::success_response_wrapper::SerializeMarker;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct EmptyModelList {
  pub success: bool,
  pub models: Vec<Value>,
  pub providers: Vec<Value>,
}

impl SerializeMarker for EmptyModelList {}

impl EmptyModelList {
  pub fn new() -> Self {
    Self { success: true, models: Vec::new(), providers: Vec::new() }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn the_list_is_empty() {
    assert_eq!(serde_json::to_value(EmptyModelList::new()).unwrap(), json!({"success": true, "models": [], "providers": []}));
  }
}
