//! `download_media_file_command`: copy a publik file (an image, a batch of images, or an MP3)
//! into the person's download folder, with the same names and folder as every other download.
//! Files live on this computer only; there is no cloud lookup.

use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;
use tokens::tokens::media_files::MediaFileToken;

use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::ResponseOrErrorType;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::state::app_preferences::app_preferences_manager::AppPreferencesManager;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::services::publik::state::publik_local_store::{is_local_token, PublikLocalStore};
use crate::services::publik::utils::copy_to_download_dir::copy_to_download_dir;

pub const DOWNLOAD_NOT_LOCAL_MESSAGE: &str = "This build keeps files on this computer only. ArtCraft cannot download this file.";
const COPY_FAILED_MESSAGE: &str = "ArtCraft could not save the file in your download folder. Check the folder in Settings and try again.";

/// `{ request: { media_token } }`: a local token (`publik_<task>_<n>`, `publik_batch_<task>` or
/// `publik_import_<id>`).
#[derive(Deserialize, Debug)]
pub struct DownloadMediaFileRequest {
  pub media_token: MediaFileToken,
}

#[derive(Serialize)]
pub struct DownloadMediaFileSuccessResponse {
  /// Where the copies went.
  pub paths: Vec<String>,
}

impl SerializeMarker for DownloadMediaFileSuccessResponse {}

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum DownloadMediaFileErrorType {
  /// The token is not a file on this computer.
  NotLocal,
  FilesystemError,
}

#[tauri::command]
pub async fn download_media_file_command(
  request: DownloadMediaFileRequest,
  app_prefs: State<'_, AppPreferencesManager>,
  app_data_root: State<'_, AppDataRoot>,
  store: State<'_, PublikLocalStore>,
) -> ResponseOrErrorType<DownloadMediaFileSuccessResponse, DownloadMediaFileErrorType> {
  info!("download_media_file_command called");
  let token = request.media_token.as_str();
  if !is_local_token(token) {
    return Err(download_error(CommandErrorStatus::BadRequest, DownloadMediaFileErrorType::NotLocal, DOWNLOAD_NOT_LOCAL_MESSAGE));
  }
  let files = store.resolve_files(token).map_err(|message| download_error(CommandErrorStatus::BadRequest, DownloadMediaFileErrorType::NotLocal, &message))?;
  let model_id = store.record_for_token(token).map(|record| record.model.as_str()).unwrap_or("artcraft");
  let prefs = app_prefs.get_clone().map_err(|err| {
    error!("Could not read the preferences: {:?}", err);
    download_error(CommandErrorStatus::ServerError, DownloadMediaFileErrorType::FilesystemError, COPY_FAILED_MESSAGE)
  })?;
  let copied = copy_to_download_dir(&app_data_root, &prefs, model_id, &files).map_err(|err| {
    error!("Could not copy {} to the download folder: {:?}", token, err);
    download_error(CommandErrorStatus::ServerError, DownloadMediaFileErrorType::FilesystemError, COPY_FAILED_MESSAGE)
  })?;
  info!("Copied {} file(s) to the download folder", copied.len());
  Ok(DownloadMediaFileSuccessResponse { paths: copied.iter().map(|path| path.to_string_lossy().into_owned()).collect() }.into())
}

fn download_error(status: CommandErrorStatus, error_type: DownloadMediaFileErrorType, message: &str) -> CommandErrorResponseWrapper<DownloadMediaFileErrorType, ()> {
  CommandErrorResponseWrapper { status, error_message: Some(message.to_string()), error_type: Some(error_type), error_details: None }
}
