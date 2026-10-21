use std::path::PathBuf;

use craft_publik::client;
use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::services::publik::commands::publik_command_error::{bad_input, from_fail, server_error, PublikCommandError, PublikCommandResponse};
use crate::services::publik::state::publik_ai_state::PublikAiState;

/// The transcription line takes files up to 25 MB.
const MAX_AUDIO_BYTES: u64 = 25 * 1024 * 1024;

const AUDIO_EXTENSIONS: &[&str] = &["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"];

/// `{ request: { path, language } }`. `path` is an audio file on this computer; `language` is an
/// optional two-letter code (`en`, `es`) that helps the model.
#[derive(Deserialize)]
pub struct PublikTranscribeRequest {
  pub path: String,
  #[serde(rename = "language")]
  pub maybe_language: Option<String>,
}

#[derive(Serialize)]
pub struct PublikTranscribeResponse {
  pub text: String,
  /// "Charged $0.0060 · $4.98 left", or empty for an own key.
  pub charge_line: String,
}

impl SerializeMarker for PublikTranscribeResponse {}

/// Audio to text through publik API (or the person's own key).
#[tauri::command]
pub async fn publik_transcribe_command(request: PublikTranscribeRequest, publik: State<'_, PublikAiState>) -> PublikCommandResponse<PublikTranscribeResponse> {
  info!("publik_transcribe_command called");
  let (path, language) = check_request(&request)?;
  let provider = publik.provider();
  let reply = match tauri::async_runtime::spawn_blocking(move || client::transcribe(&provider, &path, &language)).await {
    Ok(Ok(reply)) => reply,
    Ok(Err(fail)) => {
      info!("Transcription failed (status {}, kind {})", fail.status, fail.kind);
      publik.note_fail(&fail);
      return Err(from_fail(&fail));
    },
    Err(err) => {
      error!("Transcription thread failed: {:?}", err);
      return Err(server_error("The request stopped unexpectedly. Try again."));
    },
  };
  publik.note_reply(&reply);
  Ok(PublikTranscribeResponse { text: reply.text.clone(), charge_line: reply.charge_line() }.into())
}

fn check_request(request: &PublikTranscribeRequest) -> Result<(PathBuf, String), PublikCommandError> {
  let path = PathBuf::from(request.path.trim());
  let metadata = std::fs::metadata(&path).ok().filter(|metadata| metadata.is_file()).ok_or_else(|| bad_input("ArtCraft could not find this audio file. Choose the file again."))?;
  let extension = path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
  if !AUDIO_EXTENSIONS.contains(&extension.as_str()) {
    return Err(bad_input("ArtCraft can transcribe MP3, M4A, WAV, WebM, OGG, FLAC and MP4 files. Choose one of those."));
  }
  if metadata.len() > MAX_AUDIO_BYTES {
    return Err(bad_input("This audio file is larger than 25 MB. Choose a shorter file."));
  }
  let language = request.maybe_language.as_deref().unwrap_or_default().trim().to_ascii_lowercase();
  if !language.is_empty() && !(language.len() == 2 && language.bytes().all(|b| b.is_ascii_lowercase())) {
    return Err(bad_input("Use a two-letter language code, such as en or es, or leave the language empty."));
  }
  Ok((path, language))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn requests_are_checked_before_any_call() {
    let dir = tempfile::tempdir().unwrap();
    let audio = dir.path().join("talk.MP3");
    std::fs::write(&audio, b"id3").unwrap();
    let text = dir.path().join("notes.txt");
    std::fs::write(&text, b"hi").unwrap();

    let ok = check_request(&request(&audio, Some(" EN "))).ok().unwrap();
    assert_eq!(ok, (audio.clone(), "en".to_string()));
    assert_eq!(message(check_request(&request(&dir.path().join("missing.mp3"), None))), "ArtCraft could not find this audio file. Choose the file again.");
    assert!(message(check_request(&request(&text, None))).starts_with("ArtCraft can transcribe MP3"));
    assert!(message(check_request(&request(&audio, Some("english")))).starts_with("Use a two-letter language code"));
  }

  fn request(path: &std::path::Path, language: Option<&str>) -> PublikTranscribeRequest {
    PublikTranscribeRequest { path: path.to_string_lossy().into_owned(), maybe_language: language.map(str::to_string) }
  }

  fn message(result: Result<(PathBuf, String), PublikCommandError>) -> String {
    result.err().unwrap().error_message.unwrap()
  }
}
