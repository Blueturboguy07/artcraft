//! What publik needs to know about this build of ArtCraft.

use std::path::PathBuf;

use craft_publik::AppInfo;

use crate::version::ARTCRAFT_VERSION;

/// The publik listing slug. It also names publik's credential file for this app.
pub const PUBLIK_APP_SLUG: &str = "artcraft";

pub const PUBLIK_APP_NAME: &str = "ArtCraft";

/// The gateway lines ArtCraft uses: image generation and edits, and chat for "Improve prompt".
pub const PUBLIK_DIALECTS: &[&str] = &["images", "chat_completions"];

/// The app's public `pat_` token. It is public by design: it can only mint capped keys that
/// publik attributes to ArtCraft, and publik revokes it by timestamp. It lives at the repo root
/// so that source builds carry it.
const PUBLIK_APP_TOKEN: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../publik-app-token.txt"));

/// `config_dir` is where `ai.json` (the provider choice and the person's own key) is kept.
pub fn publik_app_info(maybe_config_dir: Option<PathBuf>) -> AppInfo {
  AppInfo { slug: PUBLIK_APP_SLUG, name: PUBLIK_APP_NAME, version: ARTCRAFT_VERSION, app_token: PUBLIK_APP_TOKEN, dialects: PUBLIK_DIALECTS, config_dir: maybe_config_dir }
}

/// Builder check (publikhq.com/skills/setup.md): `PUBLIK_SELF_TEST=1` provisions for real and
/// returns one line, `publik self-test: ok artcraft <version> (install …)`. The builder who runs
/// it is the consent. It reads and writes no ArtCraft settings.
pub fn publik_self_test() -> String {
  craft_publik::self_test(&publik_app_info(None))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn the_build_carries_a_public_app_token() {
    let info = publik_app_info(None);
    assert_eq!(info.slug, "artcraft");
    assert_eq!(info.version, ARTCRAFT_VERSION);
    assert!(info.app_token.trim().starts_with("pat_"));
    assert!(info.dialects.contains(&"images"));
  }
}
