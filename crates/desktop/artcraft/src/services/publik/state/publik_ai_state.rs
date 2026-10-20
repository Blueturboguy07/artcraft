//! The publik step's state, shared by the Tauri commands and the image job.
//!
//! It holds the person's choice (`ai.json` in ArtCraft's settings directory, mode 0600) and
//! this computer's publik credential (publik's own file, written by `craft-publik`). It is the
//! host-side twin of `craft_publik::ui::AiState`, without egui. Nothing here logs or returns a
//! key.

use std::sync::{Arc, Mutex, MutexGuard};

use craft_publik::client::{Fail, Reply};
use craft_publik::credential::{self, Credential};
use craft_publik::own_key::{self, Service};
use craft_publik::settings::{AiSettings, PROVIDER_OWN, PROVIDER_PUBLIK};
use craft_publik::{AppInfo, Line, Provider, DASHBOARD_URL, DISCLOSURE_VERSION, WHY_IT_COSTS};
use log::warn;

use crate::services::publik::state::publik_status::{PublikLink, PublikNotice, PublikStatus, PublikTexts};

const CLAIM_STATE_CLAIMED: &str = "claimed";

#[derive(Clone)]
pub struct PublikAiState {
  app: AppInfo,
  inner: Arc<Mutex<PublikAiInner>>,
}

/// What a successful own-key check found.
#[derive(Clone, Debug)]
pub struct OwnKeyCheck {
  pub model_count: usize,
  pub model: String,
}

struct PublikAiInner {
  settings: AiSettings,
  maybe_credential: Option<Credential>,
  maybe_notice: Option<PublikNotice>,
  last_charge: String,
}

impl PublikAiState {
  pub fn new(app: AppInfo) -> Self {
    let settings = AiSettings::load(app.settings_path().as_deref());
    let maybe_credential = credential::read(app.slug);
    Self { app, inner: Arc::new(Mutex::new(PublikAiInner { settings, maybe_credential, maybe_notice: None, last_charge: String::new() })) }
  }

  /// The provider in force, by the crate's resolution order. Reads files, never the network.
  pub fn provider(&self) -> Provider {
    let inner = self.lock();
    craft_publik::resolve(&self.app, &inner.settings)
  }

  pub fn status(&self) -> PublikStatus {
    let provider = self.provider();
    let inner = self.lock();
    let maybe_credential = match provider {
      Provider::Publik { .. } => inner.maybe_credential.as_ref(),
      _ => None,
    };
    let claimed = maybe_credential.is_some_and(|c| c.claim_state == CLAIM_STATE_CLAIMED);

    let (maybe_own_key_service, maybe_own_key_model, maybe_own_key_base_url) = match &provider {
      Provider::Own { service, base_url, model, .. } => (Some(service.name().to_string()), Some(model.clone()), Some(base_url.clone())),
      _ => (None, None, None),
    };

    PublikStatus { provider: provider_kind(&provider), status_line: status_line(&provider, maybe_credential), balance_line: maybe_credential.map(|c| craft_publik::balance_line(c.balance_micros.or(Some(0)), &c.claim_state)).unwrap_or_default(), cost_sentence: maybe_credential.map(|c| c.cost_sentence.trim()).filter(|s| !s.is_empty()).unwrap_or(WHY_IT_COSTS).to_string(), claimed, maybe_account_link: maybe_credential.and_then(|c| account_link(c, claimed)), dashboard_url: DASHBOARD_URL, can_provision: self.app.can_provision(), wants_first_run: !inner.settings.setup_done && !provider.is_set_up(), owes_first_card: provider.is_publik() && inner.maybe_credential.is_some() && !inner.settings.first_card_shown, supports_images: provider.supports(Line::Images), maybe_own_key_service, maybe_own_key_model, maybe_own_key_base_url, last_charge: inner.last_charge.clone(), maybe_notice: inner.maybe_notice.clone(), texts: PublikTexts::from_crate() }
  }

  /// Provision this computer for publik API. The person accepted the disclosure first.
  /// Blocking (the system `curl`): call it from a blocking thread.
  pub fn link_computer(&self) -> Result<(), String> {
    let credential = craft_publik::provision::provision(&self.app)?;
    let mut inner = self.lock();
    inner.maybe_credential = Some(credential);
    inner.settings.provider = PROVIDER_PUBLIK.into();
    inner.settings.disclosure_accepted = DISCLOSURE_VERSION;
    inner.settings.setup_done = true;
    inner.maybe_notice = None;
    self.save(&inner)
  }

  /// Check the person's own key with its service (`GET /models`), then keep it.
  /// Blocking (the system `curl`): call it from a blocking thread.
  pub fn set_own_key(&self, key: &str, base_url: &str, model: &str) -> Result<OwnKeyCheck, String> {
    let key = key.trim();
    if key.is_empty() {
      return Err("Paste a key first.".to_string());
    }
    let service = Service::detect(key);
    let base_url = base_url.trim();
    let probe_url = if base_url.is_empty() { service.base_url() } else { base_url };
    let model_ids = own_key::probe(service, probe_url, key)?;
    let model = match model.trim() {
      "" => own_key::pick_model(service, &model_ids),
      chosen => chosen.to_string(),
    };
    let mut inner = self.lock();
    inner.settings.provider = PROVIDER_OWN.into();
    inner.settings.own_key = key.to_string();
    inner.settings.own_base_url = base_url.to_string();
    inner.settings.own_model = model.clone();
    inner.settings.setup_done = true;
    inner.maybe_notice = None;
    self.save(&inner)?;
    Ok(OwnKeyCheck { model_count: model_ids.len(), model })
  }

  /// "Forget this computer's key" (publik API) or "Remove key" (own key).
  pub fn forget(&self) -> Result<(), String> {
    let provider = self.provider();
    let mut inner = self.lock();
    match provider {
      Provider::Publik { .. } => {
        credential::forget(self.app.slug);
        inner.maybe_credential = None;
        inner.settings.provider = String::new();
        inner.settings.first_card_shown = false;
      },
      Provider::Own { .. } => {
        inner.settings.own_key = String::new();
        inner.settings.provider = String::new();
      },
      Provider::NotSetUp => {},
    }
    inner.maybe_notice = None;
    inner.last_charge = String::new();
    self.save(&inner)
  }

  /// "Later" or "Done" on the setup card: the first-run card does not come back.
  pub fn close_setup(&self) -> Result<(), String> {
    let mut inner = self.lock();
    inner.settings.setup_done = true;
    if inner.maybe_credential.is_some() {
      inner.settings.first_card_shown = true;
    }
    self.save(&inner)
  }

  /// The card with the balance line and the cost sentence was on screen once.
  pub fn mark_first_card_shown(&self) -> Result<(), String> {
    let mut inner = self.lock();
    if inner.settings.first_card_shown {
      return Ok(());
    }
    inner.settings.first_card_shown = true;
    self.save(&inner)
  }

  /// A call succeeded: keep the live balance and claim state, and the charge line.
  pub fn note_reply(&self, reply: &Reply) {
    let mut inner = self.lock();
    inner.last_charge = reply.charge_line();
    if let Some(credential) = inner.maybe_credential.as_mut() {
      if let Some(balance) = reply.balance_micros {
        credential.balance_micros = Some(balance);
      }
      if let Some(claim_state) = &reply.claim_state {
        credential.claim_state = claim_state.clone();
      }
    }
    inner.maybe_notice = None;
  }

  /// A call failed. A 402 or a refused key becomes the notice (one message, at most one link);
  /// a retired key is forgotten so that the next setup provisions again.
  pub fn note_fail(&self, fail: &Fail) {
    let mut inner = self.lock();
    if fail.status == 402 || fail.status == 401 || fail.reprovision {
      inner.maybe_notice = Some(PublikNotice { message: fail.message.clone(), maybe_link: fail.link_url.clone().map(|url| PublikLink { label: fail.link_label.clone(), url }) });
    }
    if fail.reprovision {
      credential::forget(self.app.slug);
      inner.maybe_credential = None;
    }
  }

  pub fn dismiss_notice(&self) {
    self.lock().maybe_notice = None;
  }

  fn save(&self, inner: &PublikAiInner) -> Result<(), String> {
    inner.settings.save(self.app.settings_path().as_deref()).map_err(|err| {
      warn!("Could not save the publik AI settings: {}", err);
      format!("Could not save the AI settings: {err}")
    })
  }

  fn lock(&self) -> MutexGuard<'_, PublikAiInner> {
    self.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
  }
}

fn provider_kind(provider: &Provider) -> &'static str {
  match provider {
    Provider::Publik { .. } => PROVIDER_PUBLIK,
    Provider::Own { .. } => PROVIDER_OWN,
    Provider::NotSetUp => "not_set_up",
  }
}

fn status_line(provider: &Provider, maybe_credential: Option<&Credential>) -> String {
  match (provider, maybe_credential) {
    (Provider::Publik { .. }, Some(credential)) => {
      let balance = craft_publik::balance_line(credential.balance_micros, &credential.claim_state);
      if balance.is_empty() {
        "publik API".to_string()
      } else {
        format!("publik API · {balance}")
      }
    },
    _ => provider.label(),
  }
}

fn account_link(credential: &Credential, claimed: bool) -> Option<PublikLink> {
  let (label, url) = if claimed { (craft_publik::CTA_ADD_PLAN, credential.add_credit_url.as_str()) } else { (craft_publik::CTA_SIGN_IN, credential.claim_url.as_str()) };
  craft_publik::publik_link(Some(url)).map(|url| PublikLink { label: label.to_string(), url })
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::Path;

  /// No publik credential file exists for this slug, so tests never read a real install.
  const TEST_SLUG: &str = "artcraft-unit-test-no-credential";

  #[test]
  fn a_new_install_wants_the_first_run_card_until_later() {
    let dir = tempfile::tempdir().unwrap();
    let state = PublikAiState::new(app(dir.path()));
    let status = state.status();
    assert_eq!(status.provider, "not_set_up");
    assert!(status.wants_first_run);
    assert!(!status.owes_first_card);
    assert!(!status.supports_images);
    assert_eq!(status.status_line, "AI is not set up");

    state.close_setup().unwrap();
    assert!(!state.status().wants_first_run);
    // "Later" holds across launches.
    assert!(!PublikAiState::new(app(dir.path())).status().wants_first_run);
  }

  #[test]
  fn an_own_key_shows_its_service_and_model_but_never_the_key() {
    let dir = tempfile::tempdir().unwrap();
    let settings = AiSettings { provider: PROVIDER_OWN.into(), own_key: "sk-proj-secret-test-key".into(), setup_done: true, ..Default::default() };
    settings.save(Some(&dir.path().join("ai.json"))).unwrap();
    let state = PublikAiState::new(app(dir.path()));
    let status = state.status();
    assert_eq!(status.provider, "own");
    assert_eq!(status.maybe_own_key_service.as_deref(), Some("OpenAI"));
    assert!(status.supports_images);
    let json = serde_json::to_string(&status).unwrap();
    assert!(!json.contains("sk-proj-secret-test-key"));

    state.forget().unwrap();
    assert_eq!(state.status().provider, "not_set_up");
  }

  #[test]
  fn a_402_becomes_one_notice_with_one_link_and_a_success_clears_it() {
    let dir = tempfile::tempdir().unwrap();
    let state = PublikAiState::new(app(dir.path()));
    state.note_fail(&Fail { status: 402, message: "Not enough publik API balance for this request.".into(), link_label: craft_publik::CTA_SIGN_IN.into(), link_url: Some("https://publikhq.com/claim/AB12".into()), ..Default::default() });
    let notice = state.status().maybe_notice.unwrap();
    assert_eq!(notice.maybe_link.unwrap().url, "https://publikhq.com/claim/AB12");

    state.note_reply(&Reply { charge_micros: Some(40_000), balance_micros: Some(960_000), ..Default::default() });
    let status = state.status();
    assert!(status.maybe_notice.is_none());
    assert_eq!(status.last_charge, "Charged $0.04 · $0.96 left");
  }

  #[test]
  fn other_failures_leave_no_notice() {
    let dir = tempfile::tempdir().unwrap();
    let state = PublikAiState::new(app(dir.path()));
    state.note_fail(&Fail { status: 503, message: "Try again.".into(), ..Default::default() });
    assert!(state.status().maybe_notice.is_none());
  }

  fn app(dir: &Path) -> AppInfo {
    AppInfo { slug: TEST_SLUG, name: "ArtCraft", version: "0.0.0", app_token: "", dialects: &["images"], config_dir: Some(dir.to_path_buf()) }
  }
}
