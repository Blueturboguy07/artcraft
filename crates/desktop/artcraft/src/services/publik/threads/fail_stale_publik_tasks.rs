//! A publik image job lives inside the app process. A task still pending at startup belongs to
//! a run that ended before the job finished, so it can never complete: mark it failed.

use std::collections::HashSet;

use enums::common::generation_provider::GenerationProvider;
use enums::tauri::tasks::task_failure_type::TaskFailureType;
use enums::tauri::tasks::task_status::TaskStatus;
use log::{info, warn};
use sqlite_tasks::queries::list_tasks_by_provider_and_status::{list_tasks_by_provider_and_status, ListTasksByProviderAndStatusArgs};
use sqlite_tasks::queries::update_task_status_with_rich_failure::{update_task_status_with_rich_failure, UpdateTaskWithRichFailureArgs};

use crate::core::state::task_database::TaskDatabase;

const STALE_TASK_MESSAGE: &str = "ArtCraft closed before publik API finished this image. Generate it again.";

/// Infallible: a failure here only leaves old rows pending.
pub async fn fail_stale_publik_tasks(task_database: &TaskDatabase) {
  let statuses = HashSet::from([TaskStatus::Pending, TaskStatus::Started]);
  let tasks = match list_tasks_by_provider_and_status(ListTasksByProviderAndStatusArgs { db: task_database.get_connection(), provider: GenerationProvider::Publik, task_statuses: &statuses }).await {
    Ok(list) => list.tasks,
    Err(err) => {
      warn!("[publik] Could not list unfinished publik tasks: {:?}", err);
      return;
    },
  };
  for task in tasks {
    info!("[publik] Task {} did not finish before the app closed", task.id.as_str());
    let result = update_task_status_with_rich_failure(UpdateTaskWithRichFailureArgs { db: task_database.get_connection(), task_id: &task.id, status: TaskStatus::CompleteFailure, maybe_failure_type: Some(TaskFailureType::GenerationFailed), maybe_failure_message: Some(STALE_TASK_MESSAGE) }).await;
    if let Err(err) = result {
      warn!("[publik] Could not close task {}: {:?}", task.id.as_str(), err);
    }
  }
}
