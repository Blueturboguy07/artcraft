//! `media_file_delete_command`: remove a publik file (or a whole batch) from this computer, with
//! its sidecar entry. There is no cloud library to delete from.

use std::path::Path;

use log::info;
use serde_derive::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tokens::tokens::media_files::MediaFileToken;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::functional_events::media_file_deleted_event::MediaFileDeletedEvent;
use crate::services::publik::state::publik_local_store::{is_local_token, PublikLocalStore};

pub const DELETE_NOT_LOCAL_MESSAGE: &str = "This build keeps files on this computer only. ArtCraft cannot delete this file.";

/// `{ request: { media_file_token } }`: a local token (`publik_<task>_<n>`,
/// `publik_batch_<task>` or `publik_import_<id>`).
#[derive(Deserialize)]
pub struct MediaFileDeleteRequest {
  pub media_file_token: MediaFileToken,
}

#[derive(Serialize)]
pub struct MediaFileDeleteSuccessResponse {
  pub success: bool,
}

impl SerializeMarker for MediaFileDeleteSuccessResponse {}

#[tauri::command]
pub async fn media_file_delete_command(app: AppHandle, request: MediaFileDeleteRequest, store: State<'_, PublikLocalStore>) -> ResponseOrErrorMessage<MediaFileDeleteSuccessResponse> {
  info!("media_file_delete_command called");
  let token = request.media_file_token.as_str();
  if !is_local_token(token) {
    return Err(DELETE_NOT_LOCAL_MESSAGE.into());
  }
  let removed = store.delete(token)?;

  // One event for the token asked for, and one for each file a batch removed.
  MediaFileDeletedEvent { media_file_token: request.media_file_token.clone() }.send_infallible(&app);
  for file_token in removed.iter().filter_map(|path| token_of(path)).filter(|file_token| file_token != token) {
    MediaFileDeletedEvent { media_file_token: MediaFileToken::new_from_str(&file_token) }.send_infallible(&app);
  }
  info!("Removed {} file(s)", removed.len());
  Ok(MediaFileDeleteSuccessResponse { success: true }.into())
}

/// A local file's stem is its token.
fn token_of(path: &Path) -> Option<String> {
  path.file_stem().map(|stem| stem.to_string_lossy().into_owned())
}
