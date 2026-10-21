import { IMAGE_MODELS_BY_ID, Model } from "@storyteller/model-list";
import { ModelPage } from "./model-pages";

// GPT Image 1 is the default wherever an image model is picked. publik API serves
// it on every page. Pages with no publik model (video, 3D) use the list's first item.
const DEFAULT_MODEL_ID_FOR_PAGE: Partial<Record<ModelPage, string>> = {
  [ModelPage.TextToImage]: "gpt_image_1",
  [ModelPage.Canvas2D]: "gpt_image_1",
  [ModelPage.Stage3D]: "gpt_image_1",
  [ModelPage.ImageEditor]: "gpt_image_1",
};

export const defaultModelForPage = (
  models: Model[],
  page: ModelPage,
): Model => {
  const defaultId = DEFAULT_MODEL_ID_FOR_PAGE[page];

  if (defaultId) {
    const fromList = models.find(
      (m) => m.id === defaultId || m.tauriId === defaultId,
    );
    if (fromList) return fromList;

    const fromStaticMap = IMAGE_MODELS_BY_ID.get(defaultId);
    if (fromStaticMap) return fromStaticMap;
  }

  return models[0];
};
