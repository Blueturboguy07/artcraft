import { GenerationProvider } from "@storyteller/api-enums";
import { ImageModel } from "./ImageModel.js";

/**
 * The capabilities of `model` for `provider`. Every image model is already shaped for
 * publik API (the only provider), so the model comes back unchanged. Kept as a seam for
 * callers that pass the selected provider.
 */
export function imageModelForProvider(
  model: ImageModel | undefined,
  _provider: GenerationProvider | undefined,
): ImageModel | undefined {
  return model;
}
