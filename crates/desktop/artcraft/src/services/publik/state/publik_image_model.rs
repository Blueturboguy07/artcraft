//! The two image lines this build serves, and the rule that picks one from a request.

use enums::tauri::tasks::task_model_type::TaskModelType;
use serde_json::{Map, Value};

use crate::core::events::generation_events::common::GenerationModel;
use crate::services::publik::state::publik_local_store::PublikResultModel;

/// The only provider id `generate_image_command` serves.
pub const PUBLIK_PROVIDER_ID: &str = "publik";

/// The answer to every other provider or model. It is a plain sentence, never a response body.
pub const IMAGE_ROUTE_MESSAGE: &str = "This build makes images through publik API only. Choose GPT Image 1 or Nano Banana.";

/// GPT Image 1 (publik API or an OpenAI own key) or Nano Banana (publik API only).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PublikImageModel {
  GptImage1,
  NanoBanana,
}

impl PublikImageModel {
  /// Read the provider and the model from the raw request, before it is parsed, so that an
  /// unknown provider or model id gets the sentence instead of a parse error. A request with no
  /// model asks for GPT Image 1.
  pub fn route(fields: &Map<String, Value>) -> Result<Self, &'static str> {
    let provider = fields.get("provider").and_then(Value::as_str);
    if provider != Some(PUBLIK_PROVIDER_ID) {
      return Err(IMAGE_ROUTE_MESSAGE);
    }
    match fields.get("model") {
      None | Some(Value::Null) => Ok(Self::GptImage1),
      Some(Value::String(model)) => Self::from_model_id(model).ok_or(IMAGE_ROUTE_MESSAGE),
      Some(_) => Err(IMAGE_ROUTE_MESSAGE),
    }
  }

  pub fn from_model_id(model: &str) -> Option<Self> {
    match model {
      "gpt_image_1" => Some(Self::GptImage1),
      "nano_banana" => Some(Self::NanoBanana),
      _ => None,
    }
  }

  /// The id the frontend sends and the results list carries.
  pub fn model_id(self) -> &'static str {
    self.result_model().as_str()
  }

  pub fn result_model(self) -> PublikResultModel {
    match self {
      Self::GptImage1 => PublikResultModel::GptImage1,
      Self::NanoBanana => PublikResultModel::NanoBanana,
    }
  }

  pub fn task_model_type(self) -> TaskModelType {
    match self {
      Self::GptImage1 => TaskModelType::GptImage1,
      Self::NanoBanana => TaskModelType::NanoBanana,
    }
  }

  pub fn generation_model(self) -> GenerationModel {
    match self {
      Self::GptImage1 => GenerationModel::GptImage1,
      Self::NanoBanana => GenerationModel::NanoBanana,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn only_publik_with_gpt_image_1_or_nano_banana_routes() {
    assert_eq!(route(json!({"provider": "publik", "model": "gpt_image_1"})), Ok(PublikImageModel::GptImage1));
    assert_eq!(route(json!({"provider": "publik", "model": "nano_banana"})), Ok(PublikImageModel::NanoBanana));
    assert_eq!(route(json!({"provider": "publik"})), Ok(PublikImageModel::GptImage1));
  }

  #[test]
  fn every_other_provider_or_model_gets_the_sentence() {
    let cases = [
      // The 401 regression: the default model went to ArtCraft's cloud.
      json!({"provider": "publik", "model": "nano_banana_pro"}),
      json!({"model": "nano_banana_pro"}),
      json!({"provider": "artcraft", "model": "gpt_image_1"}),
      json!({"provider": "fal", "model": "nano_banana"}),
      json!({"provider": "midjourney", "model": "midjourney"}),
      json!({"provider": "grok", "model": "grok_image"}),
      json!({"provider": "publik", "model": "gpt_image_2p5_flare"}),
      json!({"provider": "publik", "model": "a_model_from_the_future"}),
      json!({"provider": "publik", "model": 7}),
      json!({"provider": "a_provider_from_the_future", "model": "gpt_image_1"}),
    ];
    for case in cases {
      assert_eq!(route(case.clone()), Err(IMAGE_ROUTE_MESSAGE), "{case}");
    }
  }

  fn route(value: Value) -> Result<PublikImageModel, &'static str> {
    PublikImageModel::route(value.as_object().unwrap())
  }
}
