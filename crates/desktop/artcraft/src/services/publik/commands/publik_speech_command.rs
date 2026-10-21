use chrono::Utc;
use craft_publik::client;
use log::{error, info, warn};
use serde_derive::{Deserialize, Serialize};
use tauri::State;
use uuid_utils::uuid::generate_random_uuid;

use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::services::publik::commands::publik_command_error::{bad_input, from_fail, server_error, PublikCommandResponse};
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_local_store::{PublikLocalStore, PublikResultFile, PublikResultModel, PublikResultRecord};
use crate::services::publik::threads::publik_image_job::{file_name, local_asset_url};

/// The speech line takes at most this many characters in one call.
const MAX_SPEECH_CHARS: usize = 4096;

/// The voices of the speech line (`tts-1`). An empty voice means `alloy`.
pub const SPEECH_VOICES: &[&str] = &["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

/// `{ request: { text, voice } }`. `voice` is one of `SPEECH_VOICES`, or empty for `alloy`.
#[derive(Deserialize)]
pub struct PublikSpeechRequest {
  pub text: String,
  #[serde(default)]
  pub voice: String,
}

#[derive(Serialize)]
pub struct PublikSpeechResponse {
  /// `publik_speech_<id>_1`: the MP3 on this computer.
  pub token: String,
  /// An `asset:` URL the webview can play.
  pub url: String,
  /// "Charged $0.0150 · $4.98 left", or empty for an own key.
  pub charge_line: String,
}

impl SerializeMarker for PublikSpeechResponse {}

/// Text to speech through publik API (or the person's own key). The MP3 is kept under
/// `~/Artcraft/publik/results` with a sidecar (model `speech`), so it shows in the results list.
#[tauri::command]
pub async fn publik_speech_command(request: PublikSpeechRequest, publik: State<'_, PublikAiState>, store: State<'_, PublikLocalStore>) -> PublikCommandResponse<PublikSpeechResponse> {
  info!("publik_speech_command called");
  let text = request.text.trim().to_string();
  if text.is_empty() {
    return Err(bad_input("Type the text to speak first."));
  }
  if text.chars().count() > MAX_SPEECH_CHARS {
    return Err(bad_input("This text is longer than 4,096 characters. Make it shorter, or split it into parts."));
  }
  let voice = request.voice.trim().to_ascii_lowercase();
  let voice = if voice.is_empty() { SPEECH_VOICES[0].to_string() } else { voice };
  if !SPEECH_VOICES.contains(&voice.as_str()) {
    return Err(bad_input("Choose one of these voices: alloy, echo, fable, onyx, nova or shimmer."));
  }

  let provider = publik.provider();
  let spoken = text.clone();
  let voice_for_call = voice.clone();
  let reply = match tauri::async_runtime::spawn_blocking(move || client::speech(&provider, &spoken, &voice_for_call)).await {
    Ok(Ok(reply)) => reply,
    Ok(Err(fail)) => {
      info!("Speech failed (status {}, kind {})", fail.status, fail.kind);
      publik.note_fail(&fail);
      return Err(from_fail(&fail));
    },
    Err(err) => {
      error!("Speech thread failed: {:?}", err);
      return Err(server_error("The request stopped unexpectedly. Try again."));
    },
  };
  publik.note_reply(&reply);
  if reply.bytes.is_empty() {
    return Err(server_error("publik API sent back no audio. Try again."));
  }

  let task_id = format!("speech_{}", generate_random_uuid().replace('-', ""));
  let token = PublikLocalStore::result_token(&task_id, 1);
  let path = store.result_path(&token, "mp3");
  let saved = std::fs::create_dir_all(store.results_dir()).and_then(|_| std::fs::write(&path, &reply.bytes));
  if let Err(err) = saved {
    warn!("Could not save the speech file: {}", err);
    return Err(server_error("ArtCraft could not save the audio on this computer. Check the free disk space and try again."));
  }
  let record = PublikResultRecord { task_id: task_id.clone(), created_at: Utc::now(), model: PublikResultModel::Speech, prompt: text, size: String::new(), maybe_voice: Some(voice), batch_token: PublikLocalStore::batch_token(&task_id), images: Vec::new(), maybe_audio: Some(PublikResultFile { token: token.clone(), file: file_name(&path), path: path.clone() }) };
  if let Err(message) = store.write_record(&record) {
    // Failing open: the MP3 exists; only the results list misses it.
    warn!("Could not write the speech sidecar: {}", message);
  }
  let url = local_asset_url(&path).ok_or_else(|| server_error("ArtCraft could not play the audio. Try again."))?;
  Ok(PublikSpeechResponse { token, url: url.to_string(), charge_line: reply.charge_line() }.into())
}
