// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { IMAGE_MODELS, IMAGE_MODELS_BY_ID } from "./ImageModels.js";
import { ALL_MODELS_LIST } from "./AllModels.js";
import { CommonAspectRatio } from "../classes/properties/CommonAspectRatio.js";
import * as modelList from "../../index.js";

describe("image models (publik API only)", () => {
  it("offers GPT Image 1 first and Nano Banana second", () => {
    expect(IMAGE_MODELS.map((model) => model.id)).toEqual(["gpt_image_1", "nano_banana"]);
    expect(IMAGE_MODELS[0].tauriId).toBe("gpt_image_1");
  });

  it("serves every image model through publik API only", () => {
    for (const model of IMAGE_MODELS) {
      expect(model.getProviders()).toEqual([GenerationProvider.Publik]);
    }
  });

  it("shapes GPT Image 1 to what publik API takes", () => {
    const model = IMAGE_MODELS_BY_ID.get("gpt_image_1")!;
    expect(model.selectorName).toBe("GPT Image 1");
    expect(model.maxImagePromptCount).toBe(1);
    expect(model.canUseImagePrompt).toBe(true);
    expect(model.usesInpaintingMask).toBe(false);
    expect(model.supportsQuality()).toBe(false);
    expect(model.supportsNewResolution()).toBe(false);
    expect(model.aspectRatios).toEqual([
      CommonAspectRatio.Square,
      CommonAspectRatio.WideThreeByTwo,
      CommonAspectRatio.TallTwoByThree,
    ]);
    expect(model.defaultAspectRatio).toBe(CommonAspectRatio.Square);
    expect(model.defaultGenerationCount).toBe(1);
    expect(model.maxGenerationCount).toBe(4);
  });

  it("offers Nano Banana as a square-only model with one reference image", () => {
    const model = IMAGE_MODELS_BY_ID.get("nano_banana")!;
    expect(model).toBeDefined();
    expect(model.tauriId).toBe("nano_banana");
    expect(model.selectorName).toBe("Nano Banana");
    expect(model.selectorDescription).toBe("Google's image model, through publik API");
    expect(model.aspectRatios).toEqual([CommonAspectRatio.Square]);
    expect(model.supportsNewAspectRatio()).toBe(false);
    expect(model.canChangeAspectRatio).toBe(false);
    expect(model.maxImagePromptCount).toBe(1);
    expect(model.usesInpaintingMask).toBe(false);
    expect(model.supportsQuality()).toBe(false);
    expect(model.supportsNewResolution()).toBe(false);
    expect(model.defaultGenerationCount).toBe(1);
    expect(model.maxGenerationCount).toBe(4);
  });

  it("offers no video, 3D or splat model", () => {
    expect(ALL_MODELS_LIST.every((model) => model.kind === "image_model")).toBe(true);
    expect(ALL_MODELS_LIST).toHaveLength(IMAGE_MODELS.length);
    const exported = modelList as Record<string, unknown>;
    expect(exported["VIDEO_MODELS"]).toBeUndefined();
    expect(exported["SPLAT_MODELS"]).toBeUndefined();
    expect(exported["OBJECT_3D_MODELS"]).toBeUndefined();
  });
});
