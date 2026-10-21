use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::services::publik::commands::publik_command_error::{bad_input, server_error, PublikCommandError, PublikCommandResponse};
use crate::services::publik::state::publik_local_store::{PublikLocalStore, MAX_IMPORT_BYTES};
use crate::services::publik::threads::publik_image_job::local_asset_url;

/// The frontend sends `{ request: { file_name, base64 } }`.
///
/// `base64` is the preferred field: Tauri 2 sends command arguments as JSON, so a 10 MB image
/// travels as one 13 MB string. A `data:image/png;base64,` prefix is accepted. `bytes` (a JSON
/// array of numbers) also works, but it is about three times larger on the wire.
#[derive(Deserialize)]
pub struct PublikImportImageRequest {
  /// The person's file name. Only the log uses it; the stored file is named by its token.
  #[serde(default)]
  pub file_name: String,

  #[serde(rename = "base64")]
  pub maybe_base64: Option<String>,

  #[serde(rename = "bytes")]
  pub maybe_bytes: Option<Vec<u8>>,
}

#[derive(Serialize)]
pub struct PublikImportImageResponse {
  /// `publik_import_<id>`: send it in `image_media_tokens` to use the image as a reference.
  pub token: String,
  /// An `asset:` URL the webview can show.
  pub url: String,
  pub width: u32,
  pub height: u32,
}

impl SerializeMarker for PublikImportImageResponse {}

/// Keep an image the person added on this computer, as a PNG under `~/Artcraft/publik/imports`.
/// No network.
#[tauri::command]
pub async fn publik_import_image_command(request: PublikImportImageRequest, store: State<'_, PublikLocalStore>) -> PublikCommandResponse<PublikImportImageResponse> {
  info!("publik_import_image_command called ({})", request.file_name);
  let bytes = request_bytes(request)?;
  let store = store.inner().clone();
  let imported = match tauri::async_runtime::spawn_blocking(move || store.import_image(&bytes)).await {
    Ok(Ok(imported)) => imported,
    Ok(Err(message)) => return Err(bad_input(message)),
    Err(err) => {
      error!("publik image import thread failed: {:?}", err);
      return Err(server_error("The import stopped unexpectedly. Try again."));
    },
  };
  let url = local_asset_url(&imported.path).ok_or_else(|| server_error("ArtCraft could not show the image. Try again."))?;
  Ok(PublikImportImageResponse { token: imported.token, url: url.to_string(), width: imported.width, height: imported.height }.into())
}

fn request_bytes(request: PublikImportImageRequest) -> Result<Vec<u8>, PublikCommandError> {
  if let Some(bytes) = request.maybe_bytes.filter(|bytes| !bytes.is_empty()) {
    return Ok(bytes);
  }
  let text = request.maybe_base64.unwrap_or_default();
  let text = text.trim();
  let text = match text.split_once(";base64,") {
    Some((prefix, data)) if prefix.starts_with("data:") => data,
    _ => text,
  };
  if text.is_empty() {
    return Err(bad_input("Choose an image first."));
  }
  if text.len() / 4 * 3 > MAX_IMPORT_BYTES + 3 {
    return Err(bad_input("This image is larger than 40 MB. Choose a smaller image."));
  }
  craft_publik::client::unbase64(text).ok_or_else(|| bad_input("ArtCraft could not read this image. Choose the image again."))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn base64_with_or_without_a_data_url_prefix_decodes() {
    let encoded = craft_publik::client::base64(b"png bytes");
    for base64 in [encoded.clone(), format!("data:image/png;base64,{encoded}")] {
      let bytes = request_bytes(PublikImportImageRequest { file_name: "a.png".into(), maybe_base64: Some(base64), maybe_bytes: None }).ok().unwrap();
      assert_eq!(bytes, b"png bytes");
    }
    let bytes = request_bytes(PublikImportImageRequest { file_name: "a.png".into(), maybe_base64: None, maybe_bytes: Some(vec![1, 2, 3]) }).ok().unwrap();
    assert_eq!(bytes, vec![1, 2, 3]);
    let err = request_bytes(PublikImportImageRequest { file_name: String::new(), maybe_base64: None, maybe_bytes: None }).err().unwrap();
    assert_eq!(err.error_message.as_deref(), Some("Choose an image first."));
  }
}
