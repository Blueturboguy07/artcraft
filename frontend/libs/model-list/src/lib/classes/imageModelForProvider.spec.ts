import { expect, it } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { IMAGE_MODELS_BY_ID } from "../lists/ImageModels.js";
import { imageModelForProvider } from "./imageModelForProvider.js";

it("returns the publik-shaped model unchanged", () => {
  const model = IMAGE_MODELS_BY_ID.get("gpt_image_1")!;
  expect(imageModelForProvider(model, GenerationProvider.Publik)).toBe(model);
  expect(imageModelForProvider(model, undefined)).toBe(model);
  expect(imageModelForProvider(undefined, GenerationProvider.Publik)).toBeUndefined();
});
