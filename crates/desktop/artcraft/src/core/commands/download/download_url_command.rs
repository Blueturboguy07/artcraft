use std::path::PathBuf;

use chrono::Local;
use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use url::Url;

use crate::core::artcraft_error::ArtcraftError;
use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::ResponseOrErrorType;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::warning_events::flash_file_download_error_event::{FlashFileDownloadErrorEvent, FlashFileDownloadErrorType};
use crate::core::state::app_preferences::app_preferences_manager::AppPreferencesManager;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::utils::download_url_to_user_download_dir::{copy_local_file_with_filename, download_url_with_filename, suggested_download_filename};
use crate::services::publik::state::publik_local_store::PublikLocalStore;
use crate::services::publik::threads::publik_image_job::local_asset_path;

const DOWNLOAD_FAILED_MESSAGE: &str = "ArtCraft could not download the file. Try again.";
const ALREADY_DOWNLOADED_MESSAGE: &str = "This file is in your download folder already.";

/// `{ request: { url, model?, batch_index?, directory? } }`. An `asset:` URL of a publik result
/// is copied from this computer; any other URL is downloaded.
#[derive(Deserialize, Debug)]
pub struct DownloadUrlRequest {
  pub url: Url,
  #[serde(rename = "model")]
  pub maybe_model: Option<String>,
  #[serde(rename = "batch_index")]
  pub maybe_batch_index: Option<usize>,
  /// Set only when the user explicitly chooses a folder for a batch download.
  #[serde(rename = "directory")]
  pub maybe_directory: Option<PathBuf>,
}

#[derive(Serialize)]
pub struct DownloadUrlSuccessResponse {
}

impl SerializeMarker for DownloadUrlSuccessResponse {}

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum DownloadUrlErrorType {
  FilesystemError,
  NetworkError,
  UnknownError,
}

#[tauri::command]
pub async fn download_url_command(
  request: DownloadUrlRequest,
  app: AppHandle,
  app_prefs: State<'_, AppPreferencesManager>,
  app_data_root: State<'_, AppDataRoot>,
  store: State<'_, PublikLocalStore>,
) -> ResponseOrErrorType<DownloadUrlSuccessResponse, DownloadUrlErrorType> {
  info!("download_url_command called");

  let result = handle_request(request, &app_prefs, &app_data_root, &store).await;

  if let Err(err) = result {
    error!("Error downloading media: {:?}", err);

    let (endpoint_message, error_type, flash_error_type, flash_message, flash_filename) = match err {
      ArtcraftError::CannotDownloadFilePathAlreadyExists { path } => (ALREADY_DOWNLOADED_MESSAGE, DownloadUrlErrorType::FilesystemError, FlashFileDownloadErrorType::FileAlreadyDownloaded, format!("This file is in your download folder already: {}", path.display()), Some(path)),
      _ => (DOWNLOAD_FAILED_MESSAGE, DownloadUrlErrorType::UnknownError, FlashFileDownloadErrorType::UnknownError, DOWNLOAD_FAILED_MESSAGE.to_string(), None),
    };

    FlashFileDownloadErrorEvent { filename: flash_filename, message: Some(flash_message), error_type: flash_error_type }.send_infallible(&app);

    return Err(CommandErrorResponseWrapper {
      status: CommandErrorStatus::ServerError,
      error_message: Some(endpoint_message.to_string()),
      error_type: Some(error_type),
      error_details: None,
    });
  }

  Ok(DownloadUrlSuccessResponse {}.into())
}

pub async fn handle_request(
  request: DownloadUrlRequest,
  app_prefs: &AppPreferencesManager,
  app_data_root: &AppDataRoot,
  store: &PublikLocalStore,
) -> Result<(), ArtcraftError> {
  let app_prefs = app_prefs.get_clone()?;

  let filename = suggested_download_filename(&request.url, &app_prefs, request.maybe_model.as_deref(), request.maybe_batch_index, Local::now());
  let directory = request.maybe_directory.unwrap_or_else(|| app_prefs.preferred_download_directory.download_directory(app_data_root));
  let maybe_local = local_asset_path(&request.url).and_then(|path| store.contains_file(&path));
  let download_path = match maybe_local {
    Some(source) => copy_local_file_with_filename(&source, &directory, &filename)?,
    None => download_url_with_filename(&request.url, &directory, &filename).await?,
  };

  info!("downloaded to: {:?}", download_path);

  Ok(())
}
