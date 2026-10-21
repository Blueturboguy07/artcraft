//! What runs once the Tauri runtime is up. Every task here is local: no cookie sync, no cloud
//! task pollers, no telemetry, no Discord presence. publik API calls happen only when the
//! person starts one.

use errors::AnyhowResult;
use tauri::AppHandle;

use crate::core::lifecycle::startup::tasks::bootstrap_task_database::bootstrap_task_database;
use crate::core::lifecycle::startup::tasks::initially_size_and_position_windows::initially_size_and_position_windows;
use crate::core::lifecycle::startup::tasks::load_provider_priority_state::load_provider_priority_state;
use crate::core::lifecycle::startup::tasks::set_app_log_level::set_app_log_level;
use crate::core::lifecycle::startup::tasks::spawn_main_window_thread::spawn_main_window_thread;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::services::publik::threads::fail_stale_publik_tasks::fail_stale_publik_tasks;

pub async fn handle_tauri_startup(app: AppHandle, root: AppDataRoot) -> AnyhowResult<()> {
  set_app_log_level(&app, &root)?;

  let task_database = bootstrap_task_database(&app, &root).await?;

  fail_stale_publik_tasks(&task_database).await;

  load_provider_priority_state(&app, &root)?;

  // Keeps the window size and position. Nothing else.
  spawn_main_window_thread(&app, &root)?;

  initially_size_and_position_windows(&app, &root);

  Ok(())
}
