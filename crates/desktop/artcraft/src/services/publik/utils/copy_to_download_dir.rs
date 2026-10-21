//! Copy publik files (which are already on this computer) into the person's download folder.
//! The name and the folder follow the same preferences as every other ArtCraft download.

use std::path::PathBuf;

use chrono::Local;

use crate::core::artcraft_error::ArtcraftError;
use crate::core::state::app_preferences::app_preferences::AppPreferences;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::utils::download_url_to_user_download_dir::{copy_local_file_with_filename, suggested_local_download_filename};

/// `model_id` names the files (`gpt_image_1_2026-10-21-10-00-00_2.png`). Returns the new paths.
pub fn copy_to_download_dir(root: &AppDataRoot, prefs: &AppPreferences, model_id: &str, files: &[PathBuf]) -> Result<Vec<PathBuf>, ArtcraftError> {
  let directory = prefs.preferred_download_directory.download_directory(root);
  let download_time = Local::now();
  let mut copied = Vec::with_capacity(files.len());
  for (index, source) in files.iter().enumerate() {
    let maybe_batch_index = (files.len() > 1).then_some(index + 1);
    let filename = suggested_local_download_filename(source, prefs, Some(model_id), maybe_batch_index, download_time);
    copied.push(copy_local_file_with_filename(source, &directory, &filename)?);
  }
  Ok(copied)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::state::app_preferences::preferred_download_directory::PreferredDownloadDirectory;

  #[test]
  fn files_are_copied_with_batch_indexes_and_never_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let root = AppDataRoot::create_existing(dir.path()).unwrap();
    let downloads = dir.path().join("chosen");
    let mut prefs = AppPreferences::default();
    prefs.preferred_download_directory = PreferredDownloadDirectory::Custom(downloads.clone());
    let sources = (1..=2)
      .map(|index| {
        let path = dir.path().join(format!("publik_task_x_{index}.png"));
        std::fs::write(&path, format!("image {index}")).unwrap();
        path
      })
      .collect::<Vec<_>>();

    let copied = copy_to_download_dir(&root, &prefs, "gpt_image_1", &sources).unwrap();
    assert_eq!(copied.len(), 2);
    for (index, path) in copied.iter().enumerate() {
      assert!(path.starts_with(&downloads));
      let name = path.file_name().unwrap().to_string_lossy();
      assert!(name.starts_with("gpt_image_1_"), "{name}");
      assert!(name.ends_with(&format!("_{}.png", index + 1)), "{name}");
      assert_eq!(std::fs::read_to_string(path).unwrap(), format!("image {}", index + 1));
    }

    let again = copy_to_download_dir(&root, &prefs, "gpt_image_1", &sources[..1]).unwrap();
    assert_eq!(again.len(), 1);
    assert!(sources[0].exists());
    assert_eq!(std::fs::read_dir(&downloads).unwrap().count(), 3);
  }
}
