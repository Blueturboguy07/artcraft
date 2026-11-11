use log::{error, info};
use tauri::{AppHandle, State};

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::services::publik::gate::publik_gate_window::run_gate;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

/// "Sign out of publik on this computer" for publik API (the gate then asks for a sign-in
/// again, at once), or "Remove key" for the person's own key.
#[tauri::command]
pub async fn publik_forget_key_command(app: AppHandle, publik: State<'_, PublikAiState>) -> ResponseOrErrorMessage<PublikStatus> {
  info!("publik_forget_key_command called");
  let signing_out = publik.provider().is_publik();
  publik.forget().map_err(|message| {
    error!("Could not forget the AI key: {}", message);
    message
  })?;
  if signing_out {
    // The main window stays; the gate window closes again once the person signed in.
    run_gate(&app, |_| {});
  }
  Ok(publik.status().into())
}
