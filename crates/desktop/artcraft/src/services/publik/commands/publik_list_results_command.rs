use chrono::SecondsFormat;
use log::debug;
use serde_derive::{Deserialize, Serialize};
use tauri::State;

use crate::core::commands::response::shorthand::InfallibleResponse;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::services::publik::state::publik_local_store::{PublikLocalStore, PublikResultFile, PublikResultModel, PublikResultRecord};
use crate::services::publik::threads::publik_image_job::local_asset_url;

const DEFAULT_LIMIT: u32 = 100;
const MAX_LIMIT: u32 = 1000;

/// `{ request: { limit } }`, or no arguments at all (100 results).
#[derive(Deserialize, Default)]
pub struct PublikListResultsRequest {
  #[serde(rename = "limit")]
  pub maybe_limit: Option<u32>,
}

/// One task: a batch of images, or one speech file.
#[derive(Serialize)]
pub struct PublikResultEntry {
  pub task_id: String,
  /// RFC 3339, UTC.
  pub created_at: String,
  /// `gpt_image_1`, `nano_banana` or `speech`.
  pub model: PublikResultModel,
  /// The prompt, or the text that became speech.
  pub prompt: String,
  pub images: Vec<PublikMediaRef>,
  pub audio: Option<PublikMediaRef>,
}

#[derive(Serialize)]
pub struct PublikMediaRef {
  pub token: String,
  /// An `asset:` URL the webview can load.
  pub url: String,
}

impl SerializeMarker for Vec<PublikResultEntry> {}

/// The results publik API made on this computer, newest first, read from the sidecars in
/// `~/Artcraft/publik/results`. No network.
#[tauri::command]
pub fn publik_list_results_command(request: Option<PublikListResultsRequest>, store: State<'_, PublikLocalStore>) -> InfallibleResponse<Vec<PublikResultEntry>> {
  debug!("publik_list_results_command called");
  let limit = request.unwrap_or_default().maybe_limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
  list_results(&store, limit as usize).into()
}

pub fn list_results(store: &PublikLocalStore, limit: usize) -> Vec<PublikResultEntry> {
  store.list_records(limit).into_iter().map(|record| entry(store, record)).collect()
}

fn entry(store: &PublikLocalStore, record: PublikResultRecord) -> PublikResultEntry {
  let media_ref = |file: &PublikResultFile| local_asset_url(&store.results_dir().join(&file.file)).map(|url| PublikMediaRef { token: file.token.clone(), url: url.to_string() });
  PublikResultEntry { task_id: record.task_id.clone(), created_at: record.created_at.to_rfc3339_opts(SecondsFormat::Secs, true), model: record.model, prompt: record.prompt.clone(), images: record.images.iter().filter_map(media_ref).collect(), audio: record.maybe_audio.as_ref().and_then(media_ref) }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  use crate::services::publik::state::publik_local_store::PublikResultFile;

  #[test]
  fn entries_carry_tokens_urls_and_an_rfc3339_time() {
    let dir = tempfile::tempdir().unwrap();
    let store = PublikLocalStore::new(dir.path());
    std::fs::create_dir_all(store.results_dir()).unwrap();
    let token = PublikLocalStore::result_token("speech_abc", 1);
    let path = store.result_path(&token, "mp3");
    std::fs::write(&path, b"mp3").unwrap();
    let record = PublikResultRecord { task_id: "speech_abc".into(), created_at: "2026-10-21T10:00:00Z".parse().unwrap(), model: PublikResultModel::Speech, prompt: "Hello there.".into(), size: String::new(), maybe_voice: Some("nova".into()), batch_token: PublikLocalStore::batch_token("speech_abc"), images: vec![], maybe_audio: Some(PublikResultFile { token: token.clone(), file: format!("{token}.mp3"), path: path.clone() }) };
    store.write_record(&record).unwrap();

    let value = serde_json::to_value(list_results(&store, 10)).unwrap();
    assert_eq!(value[0]["task_id"], "speech_abc");
    assert_eq!(value[0]["created_at"], "2026-10-21T10:00:00Z");
    assert_eq!(value[0]["model"], "speech");
    assert_eq!(value[0]["images"], json!([]));
    assert_eq!(value[0]["audio"]["token"], token);
    assert_eq!(value[0]["audio"]["url"], local_asset_url(&path).unwrap().to_string());
  }
}
