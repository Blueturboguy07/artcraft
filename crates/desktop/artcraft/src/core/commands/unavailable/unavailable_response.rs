//! The answer for a feature this build does not have.
//!
//! This build makes every AI request through publik API (or the person's own key). Features
//! that needed ArtCraft's cloud, Fal, Midjourney, Sora, Grok or World Labs keep their command
//! names, so an old caller gets one plain sentence instead of a missing-command error. No
//! command here reads its arguments or touches the network.

use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::Response;

pub const UNAVAILABLE_ERROR_TYPE: &str = "unavailable";

pub type UnavailableResponse = Response<(), String, ()>;

/// `{ status: "bad_request", error_type: "unavailable", error_message: "<Feature> is not available in this build." }`
pub fn unavailable(feature: &str) -> UnavailableResponse {
  Err(CommandErrorResponseWrapper { status: CommandErrorStatus::BadRequest, error_message: Some(unavailable_message(feature)), error_type: Some(UNAVAILABLE_ERROR_TYPE.to_string()), error_details: None })
}

pub fn unavailable_message(feature: &str) -> String {
  format!("{feature} is not available in this build.")
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn the_answer_is_one_sentence_with_the_unavailable_type() {
    let err = unavailable("Video generation").err().unwrap();
    assert_eq!(serde_json::to_value(&err).unwrap(), json!({"status": "bad_request", "error_type": "unavailable", "error_message": "Video generation is not available in this build."}));
  }
}
