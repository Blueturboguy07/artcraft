//! The cost estimate every estimate command answers: zero, with no network. publik API charges
//! the person's publik balance in dollars per call, and the result bar shows that charge after
//! each call; there are no ArtCraft credits to estimate.

use serde_derive::Serialize;

use crate::core::commands::response::success_response_wrapper::SerializeMarker;

/// The shape the frontend's estimate callers read, with every cost at zero.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ZeroCostEstimate {
  pub success: bool,
  pub cost_in_credits: u64,
  pub cost_in_usd_cents: Option<u64>,
  pub is_free: bool,
  pub is_unlimited: bool,
  pub is_rate_limited: bool,
  pub has_watermark: bool,
}

impl SerializeMarker for ZeroCostEstimate {}

impl ZeroCostEstimate {
  pub fn new() -> Self {
    Self { success: true, cost_in_credits: 0, cost_in_usd_cents: None, is_free: false, is_unlimited: false, is_rate_limited: false, has_watermark: false }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn the_estimate_is_zero() {
    assert_eq!(serde_json::to_value(ZeroCostEstimate::new()).unwrap(), json!({"success": true, "cost_in_credits": 0, "cost_in_usd_cents": null, "is_free": false, "is_unlimited": false, "is_rate_limited": false, "has_watermark": false}));
  }
}
