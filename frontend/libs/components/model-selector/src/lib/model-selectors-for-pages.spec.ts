import { expect, it } from "vitest";
import { IMAGE_MODELS } from "@storyteller/model-list";
import {
  buildCanvas2dPageList,
  buildImageEditorPageList,
  buildImageToVideoPageList,
  buildStage3dPageList,
  buildTextToImagePageList,
  IMAGE_TO_3D_OBJECT_PAGE_MODEL_LIST,
  IMAGE_TO_3D_WORLD_PAGE_MODEL_LIST,
} from "./model-selectors-for-pages";
import { defaultModelForPage } from "./defaultModelForPage";
import { ModelPage } from "./model-pages";

const IMAGE_PAGE_LISTS = {
  [ModelPage.TextToImage]: buildTextToImagePageList(IMAGE_MODELS),
  [ModelPage.Canvas2D]: buildCanvas2dPageList(IMAGE_MODELS),
  [ModelPage.ImageEditor]: buildImageEditorPageList(IMAGE_MODELS),
  [ModelPage.Stage3D]: buildStage3dPageList(IMAGE_MODELS),
};

it.each(Object.entries(IMAGE_PAGE_LISTS))(
  "offers only image models on %s, GPT Image 1 first and default",
  (page, list) => {
    const models = list.map((item) => item.model!);
    expect(models.map((model) => model.id)).toEqual(["gpt_image_1", "nano_banana"]);
    expect(models.every((model) => model.kind === "image_model")).toBe(true);
    expect(defaultModelForPage(models, page as ModelPage).id).toBe("gpt_image_1");
  },
);

it("offers no video or 3D model to any picker", () => {
  expect(buildImageToVideoPageList([])).toEqual([]);
  expect(IMAGE_TO_3D_WORLD_PAGE_MODEL_LIST).toEqual([]);
  expect(IMAGE_TO_3D_OBJECT_PAGE_MODEL_LIST).toEqual([]);
});
