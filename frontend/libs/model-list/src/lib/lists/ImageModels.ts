import { GenerationProvider } from "@storyteller/api-enums";
import { ImageModel } from "../classes/ImageModel.js";
import { ModelCreator } from "../classes/metadata/ModelCreator.js";
import { ModelTag } from "../classes/metadata/ModelTag.js";
import { CommonAspectRatio } from "../classes/properties/CommonAspectRatio.js";

// The image models publik API serves. publik API is the only provider: the person's
// publik balance, or their own key through the same setup card. The first model is
// the default in every picker.
//
// Sizes: Rust maps Square to 1024x1024, WideThreeByTwo to 1536x1024 and TallTwoByThree
// to 1024x1536 (crates/desktop/artcraft/src/services/publik/state/publik_image_size.rs).

export const IMAGE_MODELS: ImageModel[] = [
  new ImageModel({
    id: "gpt_image_1",
    tauriId: "gpt_image_1",
    fullName: "GPT Image 1",
    category: "image",
    creator: ModelCreator.OpenAi,
    providers: [GenerationProvider.Publik],
    selectorName: "GPT Image 1",
    selectorDescription: "OpenAI's image model, through publik API",
    selectorBadges: ["60 sec."],
    maxGenerationCount: 4,
    defaultGenerationCount: 1,
    tags: [ModelTag.InstructiveEdit],
    canEditImages: true,
    canUseImagePrompt: true,
    maxImagePromptCount: 1,
    usesInpaintingMask: false,
    editingIsInpainting: false,
    progressBarTime: 60000,
    maxPromptLength: 32000,
    // Square only: publik API draws GPT Image 1 at 1024x1024, so a wider pick would be a trap.
    canChangeAspectRatio: false,
    defaultAspectRatio: CommonAspectRatio.Square,
    aspectRatios: [CommonAspectRatio.Square],
  }),
  new ImageModel({
    id: "nano_banana",
    tauriId: "nano_banana",
    fullName: "Nano Banana",
    category: "image",
    creator: ModelCreator.Google,
    providers: [GenerationProvider.Publik],
    selectorName: "Nano Banana",
    selectorDescription: "Google's image model, through publik API",
    selectorBadges: ["30 sec."],
    maxGenerationCount: 4,
    defaultGenerationCount: 1,
    tags: [ModelTag.InstructiveEdit],
    canEditImages: true,
    canUseImagePrompt: true,
    maxImagePromptCount: 1,
    usesInpaintingMask: false,
    editingIsInpainting: false,
    progressBarTime: 30000,
    maxPromptLength: 32000,
    // Square only: no aspect ratio picker.
    canChangeAspectRatio: false,
    defaultAspectRatio: CommonAspectRatio.Square,
    aspectRatios: [CommonAspectRatio.Square],
  }),
];

export const IMAGE_MODELS_BY_ID: Map<string, ImageModel> = new Map(
  IMAGE_MODELS.map((model) => [model.id, model]),
);

if (IMAGE_MODELS_BY_ID.size !== IMAGE_MODELS.length) {
  throw new Error("All image models must have unique IDs");
}
