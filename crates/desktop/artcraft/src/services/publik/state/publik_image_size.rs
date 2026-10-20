//! The three sizes publik API's image line takes, from ArtCraft's aspect ratio choice.

use enums::common::generation::common_aspect_ratio::CommonAspectRatio;

/// `image_generate` and `image_edit` take one of these three sizes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PublikImageSize {
  Square,
  Landscape,
  Portrait,
}

impl PublikImageSize {
  /// Wide ratios become Landscape, tall ratios become Portrait, everything else (square, auto,
  /// nothing chosen) becomes Square.
  pub fn from_aspect_ratio(maybe_aspect_ratio: Option<CommonAspectRatio>) -> Self {
    match maybe_aspect_ratio {
      Some(CommonAspectRatio::Wide | CommonAspectRatio::WideThreeByTwo | CommonAspectRatio::WideFourByThree | CommonAspectRatio::WideFiveByFour | CommonAspectRatio::WideSixteenByNine | CommonAspectRatio::WideTwentyOneByNine) => Self::Landscape,
      Some(CommonAspectRatio::Tall | CommonAspectRatio::TallTwoByThree | CommonAspectRatio::TallThreeByFour | CommonAspectRatio::TallFourByFive | CommonAspectRatio::TallNineBySixteen | CommonAspectRatio::TallNineByTwentyOne) => Self::Portrait,
      Some(CommonAspectRatio::Auto | CommonAspectRatio::Auto2k | CommonAspectRatio::Auto3k | CommonAspectRatio::Auto4k | CommonAspectRatio::Square | CommonAspectRatio::SquareHd) | None => Self::Square,
    }
  }

  /// The `size` string the gateway expects.
  pub fn as_size(self) -> &'static str {
    match self {
      Self::Square => "1024x1024",
      Self::Landscape => "1536x1024",
      Self::Portrait => "1024x1536",
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn aspect_ratios_map_to_the_three_gateway_sizes() {
    assert_eq!(PublikImageSize::from_aspect_ratio(None).as_size(), "1024x1024");
    assert_eq!(PublikImageSize::from_aspect_ratio(Some(CommonAspectRatio::Square)).as_size(), "1024x1024");
    assert_eq!(PublikImageSize::from_aspect_ratio(Some(CommonAspectRatio::Auto)).as_size(), "1024x1024");
    assert_eq!(PublikImageSize::from_aspect_ratio(Some(CommonAspectRatio::WideThreeByTwo)).as_size(), "1536x1024");
    assert_eq!(PublikImageSize::from_aspect_ratio(Some(CommonAspectRatio::Wide)).as_size(), "1536x1024");
    assert_eq!(PublikImageSize::from_aspect_ratio(Some(CommonAspectRatio::TallTwoByThree)).as_size(), "1024x1536");
    assert_eq!(PublikImageSize::from_aspect_ratio(Some(CommonAspectRatio::TallNineBySixteen)).as_size(), "1024x1536");
  }
}
