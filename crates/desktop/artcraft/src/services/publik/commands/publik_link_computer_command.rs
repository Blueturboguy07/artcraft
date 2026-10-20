use log::{error, info};
use tauri::State;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_status::PublikStatus;

/// "Continue" after the disclosure: link this computer to publik API. publik mints a key for
/// this install; there is no key to paste.
#[tauri::command]
pub async fn publik_link_computer_command(publik: State<'_, PublikAiState>) -> ResponseOrErrorMessage<PublikStatus> {
  info!("publik_link_computer_command called");
  let state = publik.inner().clone();
  let result = tauri::async_runtime::spawn_blocking(move || state.link_computer()).await;
  match result {
    Ok(Ok(())) => Ok(publik.status().into()),
    Ok(Err(message)) => {
      error!("publik API could not set up this computer: {}", message);
      Err(message.into())
    },
    Err(err) => {
      error!("publik setup thread failed: {:?}", err);
      Err("The setup stopped unexpectedly. Try again.".into())
    },
  }
}
