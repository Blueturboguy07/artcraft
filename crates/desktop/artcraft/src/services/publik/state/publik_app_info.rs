//! What publik needs to know about this build of ArtCraft (publikhq.com/skills/setup.md). The
//! gate (`services::publik::gate`) and every publik call read it; publik's scan reads the slug
//! and the paths from this file.

use std::path::PathBuf;

use craft_publik::{AppInfo, Endpoints};

use crate::version::ARTCRAFT_VERSION;

/// The publik listing slug (publikhq.com/artcraft). It also names publik's credential file for
/// this app.
pub const APP_SLUG: &str = "artcraft";
pub const PUBLIK_APP_SLUG: &str = APP_SLUG;

pub const PUBLIK_APP_NAME: &str = "ArtCraft";

/// Images, "Improve prompt", speech and transcription call a model, so the gate asks how the
/// app pays for AI.
pub const USES_AI: bool = true;

/// The publik paths and events the module calls: `POST /api/v1/installs` mints this computer's
/// key, `GET /api/v1/wallet` says when the person signed in, `POST /api/v1/telemetry` counts
/// `app_opened` and then `active_session` every 30 minutes.
pub const ENDPOINTS: Endpoints = Endpoints { installs: "/api/v1/installs", wallet: "/api/v1/wallet", telemetry: "/api/v1/telemetry", opened: "app_opened", active: "active_session" };

/// The gateway lines ArtCraft uses, reported at provisioning: GPT Image 1 (`images`), chat for
/// "Improve prompt" (`chat_completions`), Nano Banana (`gemini`), and speech and transcription
/// (`audio`).
pub const PUBLIK_DIALECTS: &[&str] = &["images", "chat_completions", "gemini", "audio"];

/// The app's public `pat_` token. It is public by design: it can only mint capped keys that
/// publik attributes to ArtCraft, and publik revokes it by timestamp. It lives at the repo root
/// so that source builds carry it.
const PUBLIK_APP_TOKEN: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../publik-app-token.txt"));

/// `config_dir` is where `ai.json` (the provider choice and the person's own key) is kept.
pub fn publik_app_info(maybe_config_dir: Option<PathBuf>) -> AppInfo {
  AppInfo { slug: APP_SLUG, name: PUBLIK_APP_NAME, version: ARTCRAFT_VERSION, app_token: PUBLIK_APP_TOKEN, uses_ai: USES_AI, endpoints: ENDPOINTS, dialects: PUBLIK_DIALECTS, config_dir: maybe_config_dir }
}

/// Builder check (publikhq.com/skills/setup.md): `PUBLIK_SELF_TEST=1` provisions for real and
/// returns one line, `publik self-test: ok artcraft <version>`. The builder who runs it is the
/// consent. It reads and writes no ArtCraft settings.
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
    assert!(info.uses_ai);
    assert_eq!(info.endpoints, Endpoints::DEFAULT);
    assert_eq!(info.dialects, &["images", "chat_completions", "gemini", "audio"]);
  }
}
