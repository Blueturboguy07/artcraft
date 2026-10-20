use craft_publik::client;
use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::services::publik::state::publik_ai_state::PublikAiState;

const MAX_PROMPT_CHARS: usize = 4000;

const IMPROVE_PROMPT_SYSTEM: &str = "You rewrite prompts for an image generation model. Keep the person's subject, style and every detail they named. Add concrete visual detail: composition, lighting, lens or medium, color and mood. Write one paragraph of plain text under 120 words. Do not add a preamble, quotes, a title or a list.";

#[derive(Deserialize)]
pub struct PublikImprovePromptRequest {
  pub prompt: String,
}

#[derive(Serialize)]
pub struct PublikImprovePromptResponse {
  /// The suggested prompt. The person accepts it or keeps their own.
  pub suggestion: String,
  /// "Charged $0.0012 · $4.98 left", or empty for an own key.
  pub charge_line: String,
}

impl SerializeMarker for PublikImprovePromptResponse {}

/// "Improve prompt": one chat turn through publik API (or the person's own key). Nothing is
/// sent until the person clicks.
#[tauri::command]
pub async fn publik_improve_prompt_command(request: PublikImprovePromptRequest, publik: State<'_, PublikAiState>) -> ResponseOrErrorMessage<PublikImprovePromptResponse> {
  info!("publik_improve_prompt_command called");
  let prompt = request.prompt.trim().chars().take(MAX_PROMPT_CHARS).collect::<String>();
  if prompt.is_empty() {
    return Err("Type a prompt first.".into());
  }
  let provider = publik.provider();
  let result = tauri::async_runtime::spawn_blocking(move || client::chat(&provider, IMPROVE_PROMPT_SYSTEM, &prompt)).await;
  match result {
    Ok(Ok(reply)) => {
      publik.note_reply(&reply);
      let suggestion = reply.text.trim().trim_matches('"').trim().to_string();
      if suggestion.is_empty() {
        return Err("The AI service sent back no text. Try again.".into());
      }
      Ok(PublikImprovePromptResponse { suggestion, charge_line: reply.charge_line() }.into())
    },
    Ok(Err(fail)) => {
      info!("Improve prompt failed (status {}, kind {})", fail.status, fail.kind);
      publik.note_fail(&fail);
      Err(fail.message.into())
    },
    Err(err) => {
      error!("Improve prompt thread failed: {:?}", err);
      Err("The request stopped unexpectedly. Try again.".into())
    },
  }
}
