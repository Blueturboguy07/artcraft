//! The error shape the publik commands share: one status, one error type, one sentence.

use craft_publik::client::Fail;
use serde_derive::Serialize;

use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::Response;

pub type PublikCommandResponse<T> = Response<T, PublikCommandErrorType, ()>;

pub type PublikCommandError = CommandErrorResponseWrapper<PublikCommandErrorType, ()>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PublikCommandErrorType {
  /// The request cannot work as sent. The message says what to change.
  BadInput,
  /// AI is not set up on this computer. The frontend opens the setup card.
  NeedsPublikSetup,
  /// publik API (or the own key's service) refused or failed. The message comes from it.
  ServiceError,
  /// Something failed on this computer.
  ServerError,
}

pub fn bad_input(message: impl Into<String>) -> PublikCommandError {
  publik_error(CommandErrorStatus::BadRequest, PublikCommandErrorType::BadInput, message)
}

pub fn server_error(message: impl Into<String>) -> PublikCommandError {
  publik_error(CommandErrorStatus::ServerError, PublikCommandErrorType::ServerError, message)
}

/// A failed `craft-publik` call. Its message is already a sentence for people.
pub fn from_fail(fail: &Fail) -> PublikCommandError {
  match (fail.kind.as_str(), fail.status) {
    ("not_set_up", _) => publik_error(CommandErrorStatus::Unauthorized, PublikCommandErrorType::NeedsPublikSetup, fail.message.clone()),
    ("unsupported" | "bad_input", _) => bad_input(fail.message.clone()),
    (_, 401 | 402) => publik_error(CommandErrorStatus::Unauthorized, PublikCommandErrorType::ServiceError, fail.message.clone()),
    (_, 429) => publik_error(CommandErrorStatus::TooManyRequests, PublikCommandErrorType::ServiceError, fail.message.clone()),
    (_, 400 | 413 | 422) => publik_error(CommandErrorStatus::BadRequest, PublikCommandErrorType::ServiceError, fail.message.clone()),
    _ => publik_error(CommandErrorStatus::ServerError, PublikCommandErrorType::ServiceError, fail.message.clone()),
  }
}

fn publik_error(status: CommandErrorStatus, error_type: PublikCommandErrorType, message: impl Into<String>) -> PublikCommandError {
  CommandErrorResponseWrapper { status, error_message: Some(message.into()), error_type: Some(error_type), error_details: None }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn fails_keep_their_sentence_and_name_the_setup_case() {
    let err = from_fail(&Fail::not_set_up());
    assert_eq!(serde_json::to_value(&err).unwrap(), json!({"status": "unauthorized", "error_type": "needs_publik_setup", "error_message": Fail::not_set_up().message}));
    let err = from_fail(&Fail { status: 402, kind: "insufficient_credit".into(), message: "Not enough publik API balance for this request.".into(), ..Default::default() });
    assert_eq!(serde_json::to_value(&err).unwrap()["error_type"], "service_error");
    assert_eq!(err.error_message.as_deref(), Some("Not enough publik API balance for this request."));
  }
}
