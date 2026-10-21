//! Everything publik makes or receives stays on this computer, in one directory:
//! `~/Artcraft/publik/`.
//!
//! - `imports/publik_import_<id>.png`: images the person added (reference images).
//! - `results/publik_<task>_<n>.png` and `results/publik_<task>_1.mp3`: what publik API made.
//! - `results/<task>.json`: one sidecar per task (prompt, model, time, size, files, tokens), so
//!   the history survives a restart.
//!
//! A local token is a file stem. It never carries a path, so it cannot point outside this
//! directory. Any other token (an ArtCraft cloud `mf_` token) is not on this computer.

use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use image::imageops::FilterType;
use image::{GenericImageView, ImageFormat};
use log::warn;
use serde_derive::{Deserialize, Serialize};
use uuid_utils::uuid::generate_random_uuid;

pub const PUBLIK_DIR: &str = "publik";
const IMPORTS_DIR: &str = "imports";
const RESULTS_DIR: &str = "results";
const SIDECAR_EXTENSION: &str = "json";
const RESULT_EXTENSIONS: &[&str] = &["png", "mp3"];

pub const LOCAL_TOKEN_PREFIX: &str = "publik_";
pub const IMPORT_TOKEN_PREFIX: &str = "publik_import_";
pub const BATCH_TOKEN_PREFIX: &str = "publik_batch_";
const MAX_TOKEN_CHARS: usize = 200;

/// An imported image keeps at most this many pixels on its longest side. Larger images are
/// scaled down, so that one request stays inside what both image lines accept.
pub const MAX_IMPORT_SIDE: u32 = 2048;
pub const MAX_IMPORT_BYTES: usize = 40 * 1024 * 1024;

pub const NOT_LOCAL_MESSAGE: &str = "This build keeps images on this computer. Add the image again.";
pub const MISSING_MESSAGE: &str = "ArtCraft could not find this image on this computer. Add the image again.";

/// The `publik/` directory under ArtCraft's data directory.
#[derive(Clone, Debug)]
pub struct PublikLocalStore {
  dir: PathBuf,
}

/// The model a result came from, as the sidecar and the results list name it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PublikResultModel {
  GptImage1,
  NanoBanana,
  Speech,
}

/// One task's sidecar (`results/<task>.json`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PublikResultRecord {
  pub task_id: String,
  pub created_at: DateTime<Utc>,
  pub model: PublikResultModel,
  /// The prompt for images, the text for speech.
  pub prompt: String,
  /// "1024x1024": the pixel size of the first image. Empty for speech.
  #[serde(default)]
  pub size: String,
  #[serde(default)]
  pub maybe_voice: Option<String>,
  /// `publik_batch_<task>`: names every file of this task at once.
  pub batch_token: String,
  #[serde(default)]
  pub images: Vec<PublikResultFile>,
  #[serde(default)]
  pub maybe_audio: Option<PublikResultFile>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PublikResultFile {
  pub token: String,
  /// The file name inside `results/`.
  pub file: String,
  /// The full path when the file was written. Reads use `file`, so a moved data directory
  /// still works.
  pub path: PathBuf,
}

/// An image the person added, stored as a PNG under `imports/`.
#[derive(Clone, Debug)]
pub struct ImportedImage {
  pub token: String,
  pub path: PathBuf,
  pub width: u32,
  pub height: u32,
}

/// What a local token names.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LocalToken<'a> {
  /// `publik_import_<id>`: an image the person added.
  Import(&'a str),
  /// `publik_batch_<task>`: every file of one task.
  Batch { task_id: &'a str },
  /// `publik_<task>_<n>`: one result file.
  Result(&'a str),
}

impl PublikResultModel {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::GptImage1 => "gpt_image_1",
      Self::NanoBanana => "nano_banana",
      Self::Speech => "speech",
    }
  }
}

impl PublikLocalStore {
  /// `app_data_dir` is ArtCraft's data directory (`~/Artcraft`).
  pub fn new(app_data_dir: &Path) -> Self {
    Self { dir: app_data_dir.join(PUBLIK_DIR) }
  }

  pub fn dir(&self) -> &Path {
    &self.dir
  }

  pub fn results_dir(&self) -> PathBuf {
    self.dir.join(RESULTS_DIR)
  }

  fn imports_dir(&self) -> PathBuf {
    self.dir.join(IMPORTS_DIR)
  }

  /// The canonical path of a file inside this directory, or `None` for any other path.
  pub fn contains_file(&self, path: &Path) -> Option<PathBuf> {
    let dir = self.dir.canonicalize().ok()?;
    let path = path.canonicalize().ok()?;
    (path.starts_with(&dir) && path.is_file()).then_some(path)
  }

  // ── Tokens ──

  pub fn result_token(task_id: &str, index: usize) -> String {
    format!("{LOCAL_TOKEN_PREFIX}{task_id}_{index}")
  }

  pub fn batch_token(task_id: &str) -> String {
    format!("{BATCH_TOKEN_PREFIX}{task_id}")
  }

  /// Where a new result file goes: `results/<token>.<extension>`.
  pub fn result_path(&self, token: &str, extension: &str) -> PathBuf {
    self.results_dir().join(format!("{token}.{extension}"))
  }

  // ── Imports ──

  /// Keep an image the person added as a PNG. Any format the `image` crate reads is accepted.
  pub fn import_image(&self, bytes: &[u8]) -> Result<ImportedImage, String> {
    if bytes.is_empty() {
      return Err("The image is empty. Choose another image.".to_string());
    }
    if bytes.len() > MAX_IMPORT_BYTES {
      return Err("This image is larger than 40 MB. Choose a smaller image.".to_string());
    }
    let image = image::load_from_memory(bytes).map_err(|_| "ArtCraft could not read this image. Use a PNG, JPEG or WebP file.".to_string())?;
    let (width, height) = image.dimensions();
    let image = if width.max(height) > MAX_IMPORT_SIDE { image.resize(MAX_IMPORT_SIDE, MAX_IMPORT_SIDE, FilterType::Lanczos3) } else { image };
    let (width, height) = image.dimensions();

    let dir = self.imports_dir();
    std::fs::create_dir_all(&dir).map_err(|err| save_error(&dir, &err))?;
    let token = format!("{IMPORT_TOKEN_PREFIX}{}", generate_random_uuid().replace('-', ""));
    let path = dir.join(format!("{token}.png"));
    image.save_with_format(&path, ImageFormat::Png).map_err(|err| {
      warn!("[publik] Could not save an imported image: {}", err);
      "ArtCraft could not save the image on this computer. Check the free disk space and try again.".to_string()
    })?;
    Ok(ImportedImage { token, path, width, height })
  }

  // ── Resolving tokens ──

  /// The image file a reference token names. A batch names its first image.
  pub fn resolve_image(&self, token: &str) -> Result<PathBuf, String> {
    let files = self.resolve_files(token)?;
    files.into_iter().find(|path| has_extension(path, "png")).ok_or_else(|| MISSING_MESSAGE.to_string())
  }

  /// Every file a token names: one file, or all files of a batch.
  pub fn resolve_files(&self, token: &str) -> Result<Vec<PathBuf>, String> {
    let parsed = parse_local_token(token).ok_or_else(|| NOT_LOCAL_MESSAGE.to_string())?;
    let files = match parsed {
      LocalToken::Import(token) => vec![self.imports_dir().join(format!("{token}.png"))],
      LocalToken::Batch { task_id } => match self.read_record(task_id) {
        Some(record) => record_files(&record).into_iter().map(|file| self.results_dir().join(&file.file)).collect(),
        None => Vec::new(),
      },
      LocalToken::Result(token) => self.result_file_for_token(token).into_iter().collect(),
    };
    let files = files.into_iter().filter(|path| path.is_file()).collect::<Vec<_>>();
    if files.is_empty() {
      return Err(MISSING_MESSAGE.to_string());
    }
    Ok(files)
  }

  /// The sidecar a result or batch token belongs to. Imports have none.
  pub fn record_for_token(&self, token: &str) -> Option<PublikResultRecord> {
    match parse_local_token(token)? {
      LocalToken::Import(_) => None,
      LocalToken::Batch { task_id } => self.read_record(task_id),
      LocalToken::Result(token) => self.read_record(result_task_id(token)?),
    }
  }

  fn result_file_for_token(&self, token: &str) -> Option<PathBuf> {
    if let Some(record) = result_task_id(token).and_then(|task_id| self.read_record(task_id)) {
      if let Some(file) = record_files(&record).into_iter().find(|file| file.token == token) {
        return Some(self.results_dir().join(&file.file));
      }
    }
    RESULT_EXTENSIONS.iter().map(|extension| self.result_path(token, extension)).find(|path| path.is_file())
  }

  // ── Sidecars ──

  /// Write (or replace) a task's sidecar. The write is atomic: a crash leaves the old file.
  pub fn write_record(&self, record: &PublikResultRecord) -> Result<(), String> {
    let dir = self.results_dir();
    std::fs::create_dir_all(&dir).map_err(|err| save_error(&dir, &err))?;
    let bytes = serde_json::to_vec_pretty(record).map_err(|err| format!("ArtCraft could not write the result list: {err}"))?;
    let temporary = tempfile::NamedTempFile::new_in(&dir).map_err(|err| save_error(&dir, &err))?;
    std::fs::write(temporary.path(), bytes).map_err(|err| save_error(&dir, &err))?;
    temporary.persist(self.sidecar_path(&record.task_id)).map_err(|err| save_error(&dir, &err.error))?;
    Ok(())
  }

  pub fn read_record(&self, task_id: &str) -> Option<PublikResultRecord> {
    if !is_token_text(task_id) {
      return None;
    }
    let bytes = std::fs::read(self.sidecar_path(task_id)).ok()?;
    serde_json::from_slice(&bytes).ok()
  }

  /// Newest first. Files deleted outside ArtCraft are left out; a task with no file left is
  /// left out.
  pub fn list_records(&self, limit: usize) -> Vec<PublikResultRecord> {
    let Ok(entries) = std::fs::read_dir(self.results_dir()) else {
      return Vec::new();
    };
    let results_dir = self.results_dir();
    let mut records = entries
      .filter_map(Result::ok)
      .map(|entry| entry.path())
      .filter(|path| has_extension(path, SIDECAR_EXTENSION))
      .filter_map(|path| std::fs::read(&path).ok())
      .filter_map(|bytes| serde_json::from_slice::<PublikResultRecord>(&bytes).ok())
      .map(|mut record| {
        record.images.retain(|file| results_dir.join(&file.file).is_file());
        record.maybe_audio = record.maybe_audio.filter(|file| results_dir.join(&file.file).is_file());
        record
      })
      .filter(|record| !record.images.is_empty() || record.maybe_audio.is_some())
      .collect::<Vec<_>>();
    records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    records.truncate(limit);
    records
  }

  fn sidecar_path(&self, task_id: &str) -> PathBuf {
    self.results_dir().join(format!("{task_id}.{SIDECAR_EXTENSION}"))
  }

  // ── Deleting ──

  /// Remove the file(s) a token names and its sidecar entry. A task whose last file goes loses
  /// its sidecar too. Returns the removed files.
  pub fn delete(&self, token: &str) -> Result<Vec<PathBuf>, String> {
    let parsed = parse_local_token(token).ok_or_else(|| NOT_LOCAL_MESSAGE.to_string())?;
    let removed = match parsed {
      LocalToken::Import(_) => remove_files(self.resolve_files(token)?)?,
      LocalToken::Batch { task_id } => {
        let files = self.resolve_files(token).unwrap_or_default();
        let removed = remove_files(files)?;
        remove_file_if_present(&self.sidecar_path(task_id))?;
        removed
      },
      LocalToken::Result(token) => {
        let files = self.resolve_files(token)?;
        let removed = remove_files(files)?;
        if let Some(task_id) = result_task_id(token) {
          if let Some(mut record) = self.read_record(task_id) {
            record.images.retain(|file| file.token != token);
            record.maybe_audio = record.maybe_audio.filter(|file| file.token != token);
            if record.images.is_empty() && record.maybe_audio.is_none() {
              remove_file_if_present(&self.sidecar_path(task_id))?;
            } else {
              self.write_record(&record)?;
            }
          }
        }
        removed
      },
    };
    Ok(removed)
  }
}

/// `Some` for a token this store may own: `publik_` and then letters, digits, `_` or `-` only.
pub fn parse_local_token(token: &str) -> Option<LocalToken<'_>> {
  if !token.starts_with(LOCAL_TOKEN_PREFIX) || !is_token_text(token) {
    return None;
  }
  if let Some(id) = token.strip_prefix(IMPORT_TOKEN_PREFIX) {
    return (!id.is_empty()).then_some(LocalToken::Import(token));
  }
  if let Some(task_id) = token.strip_prefix(BATCH_TOKEN_PREFIX) {
    return (!task_id.is_empty()).then_some(LocalToken::Batch { task_id });
  }
  (token.len() > LOCAL_TOKEN_PREFIX.len()).then_some(LocalToken::Result(token))
}

pub fn is_local_token(token: &str) -> bool {
  parse_local_token(token).is_some()
}

/// `publik_<task>_<n>` → `<task>`.
fn result_task_id(token: &str) -> Option<&str> {
  let rest = token.strip_prefix(LOCAL_TOKEN_PREFIX)?;
  let (task_id, index) = rest.rsplit_once('_')?;
  (!task_id.is_empty() && !index.is_empty() && index.bytes().all(|b| b.is_ascii_digit())).then_some(task_id)
}

fn is_token_text(value: &str) -> bool {
  !value.is_empty() && value.len() <= MAX_TOKEN_CHARS && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn record_files(record: &PublikResultRecord) -> Vec<&PublikResultFile> {
  record.images.iter().chain(record.maybe_audio.iter()).collect()
}

fn has_extension(path: &Path, extension: &str) -> bool {
  path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case(extension))
}

fn remove_files(files: Vec<PathBuf>) -> Result<Vec<PathBuf>, String> {
  for path in &files {
    remove_file_if_present(path)?;
  }
  Ok(files)
}

fn remove_file_if_present(path: &Path) -> Result<(), String> {
  match std::fs::remove_file(path) {
    Ok(()) => Ok(()),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(err) => {
      warn!("[publik] Could not remove {}: {}", path.display(), err);
      Err("ArtCraft could not remove the file. Close other apps that use it and try again.".to_string())
    },
  }
}

fn save_error(dir: &Path, err: &std::io::Error) -> String {
  warn!("[publik] Could not write in {}: {}", dir.display(), err);
  "ArtCraft could not save on this computer. Check the free disk space and try again.".to_string()
}

#[cfg(test)]
mod tests {
  use super::*;
  use image::{ImageBuffer, Rgba};

  const TASK_ID: &str = "task_01ABCDEFGH";

  mod token_tests {
    use super::*;

    #[test]
    fn local_tokens_parse_and_cloud_tokens_do_not() {
      assert_eq!(parse_local_token("publik_import_0a1b"), Some(LocalToken::Import("publik_import_0a1b")));
      assert_eq!(parse_local_token("publik_batch_task_01AB"), Some(LocalToken::Batch { task_id: "task_01AB" }));
      assert_eq!(parse_local_token("publik_task_01AB_2"), Some(LocalToken::Result("publik_task_01AB_2")));
      assert_eq!(result_task_id("publik_task_01AB_2"), Some("task_01AB"));
      for token in ["mf_0123", "", "publik_", "publik_import_", "publik_batch_", "publik_../../etc/passwd", "publik_a/b", "publik_a.png"] {
        assert_eq!(parse_local_token(token), None, "{token}");
      }
    }
  }

  mod store_tests {
    use super::*;

    #[test]
    fn an_import_resolves_to_its_png_and_a_cloud_token_gets_the_sentence() {
      let dir = tempfile::tempdir().unwrap();
      let store = PublikLocalStore::new(dir.path());
      let imported = store.import_image(&jpeg_bytes(30, 20)).unwrap();
      assert!(imported.token.starts_with(IMPORT_TOKEN_PREFIX));
      assert_eq!((imported.width, imported.height), (30, 20));
      assert_eq!(store.resolve_image(&imported.token).unwrap(), imported.path);
      assert_eq!(image::open(&imported.path).unwrap().dimensions(), (30, 20));
      assert!(imported.path.starts_with(dir.path().join("publik").join("imports")));

      assert_eq!(store.resolve_image("mf_cloudtoken").unwrap_err(), NOT_LOCAL_MESSAGE);
      assert_eq!(store.resolve_image("publik_import_gone").unwrap_err(), MISSING_MESSAGE);
      assert!(store.import_image(b"not an image").unwrap_err().starts_with("ArtCraft could not read this image."));
    }

    #[test]
    fn large_imports_are_scaled_down() {
      let dir = tempfile::tempdir().unwrap();
      let store = PublikLocalStore::new(dir.path());
      let imported = store.import_image(&png_bytes(MAX_IMPORT_SIDE * 2, 100)).unwrap();
      assert_eq!(imported.width, MAX_IMPORT_SIDE);
      assert_eq!(imported.height, 50);
    }

    #[test]
    fn a_sidecar_round_trips_and_lists_newest_first() {
      let dir = tempfile::tempdir().unwrap();
      let store = PublikLocalStore::new(dir.path());
      let older = record_with_files(&store, "task_old", PublikResultModel::GptImage1, 1, "2026-10-20T10:00:00Z");
      let newer = record_with_files(&store, TASK_ID, PublikResultModel::NanoBanana, 2, "2026-10-21T10:00:00Z");

      assert_eq!(store.read_record(TASK_ID).unwrap(), newer);
      let listed = store.list_records(10);
      assert_eq!(listed, vec![newer.clone(), older]);
      assert_eq!(store.list_records(1), vec![newer.clone()]);

      // A result token and the batch token resolve to the files on disk.
      let second = PublikLocalStore::result_token(TASK_ID, 2);
      assert_eq!(store.resolve_image(&second).unwrap(), store.result_path(&second, "png"));
      assert_eq!(store.resolve_files(&PublikLocalStore::batch_token(TASK_ID)).unwrap().len(), 2);
    }

    #[test]
    fn deleting_one_image_keeps_the_rest_and_the_last_one_removes_the_sidecar() {
      let dir = tempfile::tempdir().unwrap();
      let store = PublikLocalStore::new(dir.path());
      record_with_files(&store, TASK_ID, PublikResultModel::GptImage1, 2, "2026-10-21T10:00:00Z");
      let first = PublikLocalStore::result_token(TASK_ID, 1);
      let second = PublikLocalStore::result_token(TASK_ID, 2);

      let removed = store.delete(&first).unwrap();
      assert_eq!(removed, vec![store.result_path(&first, "png")]);
      assert!(!removed[0].exists());
      let record = store.read_record(TASK_ID).unwrap();
      assert_eq!(record.images.len(), 1);
      assert_eq!(record.images[0].token, second);

      store.delete(&second).unwrap();
      assert!(store.read_record(TASK_ID).is_none());
      assert!(store.list_records(10).is_empty());
      assert_eq!(store.delete("mf_cloudtoken").unwrap_err(), NOT_LOCAL_MESSAGE);
    }

    #[test]
    fn deleting_a_batch_removes_every_file_and_the_sidecar() {
      let dir = tempfile::tempdir().unwrap();
      let store = PublikLocalStore::new(dir.path());
      record_with_files(&store, TASK_ID, PublikResultModel::GptImage1, 3, "2026-10-21T10:00:00Z");
      let removed = store.delete(&PublikLocalStore::batch_token(TASK_ID)).unwrap();
      assert_eq!(removed.len(), 3);
      assert!(removed.iter().all(|path| !path.exists()));
      assert!(store.read_record(TASK_ID).is_none());
    }
  }

  fn record_with_files(store: &PublikLocalStore, task_id: &str, model: PublikResultModel, count: usize, created_at: &str) -> PublikResultRecord {
    std::fs::create_dir_all(store.results_dir()).unwrap();
    let images = (1..=count)
      .map(|index| {
        let token = PublikLocalStore::result_token(task_id, index);
        let path = store.result_path(&token, "png");
        std::fs::write(&path, png_bytes(4, 4)).unwrap();
        PublikResultFile { file: format!("{token}.png"), token, path }
      })
      .collect();
    let record = PublikResultRecord { task_id: task_id.to_string(), created_at: created_at.parse().unwrap(), model, prompt: "a red kite".to_string(), size: "4x4".to_string(), maybe_voice: None, batch_token: PublikLocalStore::batch_token(task_id), images, maybe_audio: None };
    store.write_record(&record).unwrap();
    record
  }

  fn png_bytes(width: u32, height: u32) -> Vec<u8> {
    encode(width, height, ImageFormat::Png)
  }

  fn jpeg_bytes(width: u32, height: u32) -> Vec<u8> {
    encode(width, height, ImageFormat::Jpeg)
  }

  fn encode(width: u32, height: u32, format: ImageFormat) -> Vec<u8> {
    let image = image::DynamicImage::ImageRgba8(ImageBuffer::from_pixel(width, height, Rgba([200, 30, 30, 255])));
    let image = if format == ImageFormat::Jpeg { image::DynamicImage::ImageRgb8(image.to_rgb8()) } else { image };
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, format).unwrap();
    bytes.into_inner()
  }
}
