//! Guards that keep ArtCraft's cloud out of this build. Every AI request goes through publik API
//! or the person's own key; these tests fail if a command can reach api.storyteller.ai again.
//! This file lives outside the scanned directories so that it does not match itself.

use std::path::{Path, PathBuf};

/// Directories (under `src/`) where no file may name the ArtCraft cloud.
const SCANNED_DIRS: &[&str] = &["core/commands", "services/publik"];

/// Text that only code which talks to ArtCraft's cloud contains.
const FORBIDDEN: &[&str] = &["storyteller_host", "ApiHost::Storyteller", "basic_json_post_request", "api.storyteller.ai"];

/// Client crates for the clouds this build does not use.
const FORBIDDEN_DEPENDENCIES: &[&str] = &["artcraft_client", "artcraft_router", "artcraft_api_defs", "fal_client", "midjourney_client", "openai_sora_client", "grok_consumer_client", "grok_api_client", "worldlabs_consumer_client", "worldlabs_api_client", "discord-rich-presence"];

#[test]
fn no_command_or_publik_file_can_reach_the_artcraft_cloud() {
  let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
  let mut scanned = 0;
  let mut found = Vec::new();
  for dir in SCANNED_DIRS {
    for path in files_under(&src.join(dir)) {
      scanned += 1;
      let text = std::fs::read_to_string(&path).unwrap_or_default();
      for needle in FORBIDDEN {
        if text.contains(needle) {
          found.push(format!("{} contains `{}`", path.strip_prefix(&src).unwrap_or(&path).display(), needle));
        }
      }
    }
  }
  assert!(scanned > 50, "the scan read only {scanned} files; check SCANNED_DIRS");
  assert!(found.is_empty(), "the ArtCraft cloud is back:\n{}", found.join("\n"));
}

#[test]
fn the_crate_depends_on_no_cloud_client() {
  let manifest = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml")).unwrap();
  let found = FORBIDDEN_DEPENDENCIES.iter().filter(|name| manifest.lines().any(|line| line.trim_start().starts_with(*name))).collect::<Vec<_>>();
  assert!(found.is_empty(), "Cargo.toml depends on cloud clients again: {found:?}");
}

#[test]
fn no_artcraft_account_command_is_registered() {
  let lib = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/lib.rs")).unwrap();
  let handler = lib.split("generate_handler![").nth(1).unwrap_or_default();
  assert!(handler.contains("generate_image_command"), "the handler list moved; update this test");
  assert!(!handler.contains("storyteller_"), "an ArtCraft account command is registered again");
}

fn files_under(dir: &Path) -> Vec<PathBuf> {
  let mut files = Vec::new();
  let Ok(entries) = std::fs::read_dir(dir) else {
    return files;
  };
  for entry in entries.filter_map(Result::ok) {
    let path = entry.path();
    if path.is_dir() {
      files.extend(files_under(&path));
    } else {
      files.push(path);
    }
  }
  files
}
