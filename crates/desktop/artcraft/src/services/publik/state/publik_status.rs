//! What the frontend shows about publik API: the setup card, the settings block and the result
//! bar under the prompt box all read this one shape. It never carries a key.

use serde_derive::Serialize;

use crate::core::commands::response::success_response_wrapper::SerializeMarker;

pub const PUBLIK_TERMS_URL: &str = "https://publikhq.com/terms#api";

#[derive(Clone, Debug, Serialize)]
pub struct PublikStatus {
  /// `publik`, `own` or `not_set_up`.
  pub provider: &'static str,

  /// "publik API · $0.05 of publik balance", "Your own key (OpenAI) · gpt-4.1-mini", or
  /// "AI is not set up".
  pub status_line: String,

  /// Line 1 of the first-run card: the balance, or the offer to link this computer.
  pub balance_line: String,

  /// Why use costs money: the sentence publik sent at provisioning, or the crate's default.
  pub cost_sentence: String,

  /// The person linked this computer to a publik account.
  pub claimed: bool,

  /// "Sign in with publik" before the claim, "Add a plan or pack" after it. One link at most.
  pub maybe_account_link: Option<PublikLink>,

  pub dashboard_url: &'static str,

  /// This build carries a publik app token, so "publik API" can be set up.
  pub can_provision: bool,

  /// Show the setup card on this launch: nothing is chosen and "Later" was never pressed.
  pub wants_first_run: bool,

  /// publik API is set up but its first-run card was never shown.
  pub owes_first_card: bool,

  /// The provider in force can make images (publik API, or an OpenAI own key).
  pub supports_images: bool,

  /// For an own key: the service name the key prefix names (`OpenAI`), never the key.
  pub maybe_own_key_service: Option<String>,

  pub maybe_own_key_model: Option<String>,

  pub maybe_own_key_base_url: Option<String>,

  /// "Charged $0.04 · $0.96 left" after the last call, or empty.
  pub last_charge: String,

  /// A failed call that the person must act on (a 402, a retired key): one message, one link.
  pub maybe_notice: Option<PublikNotice>,

  /// The copy the setup card shows, verbatim from `craft-publik`.
  pub texts: PublikTexts,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct PublikLink {
  pub label: String,
  pub url: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct PublikNotice {
  pub message: String,
  pub maybe_link: Option<PublikLink>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PublikTexts {
  pub disclosure: &'static str,
  pub disclosure_data: &'static str,
  pub terms_url: &'static str,
  pub sign_in: &'static str,
  pub add_plan: &'static str,
  pub later: &'static str,
}

impl SerializeMarker for PublikStatus {}

impl PublikTexts {
  pub fn from_crate() -> Self {
    Self { disclosure: craft_publik::DISCLOSURE, disclosure_data: craft_publik::DISCLOSURE_DATA, terms_url: PUBLIK_TERMS_URL, sign_in: craft_publik::CTA_SIGN_IN, add_plan: craft_publik::CTA_ADD_PLAN, later: craft_publik::CTA_LATER }
  }
}
