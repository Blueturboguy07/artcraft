import { useMemo } from "react";
import type { PopoverItem } from "@storyteller/ui-popover";
import { ImageIcon } from "lucide-react";
import {
  getCreatorListIcon,
  Model,
  ImageModel,
  VideoModel,
} from "@storyteller/model-list";
import { ModelTag } from "@storyteller/model-list";
import { useImageModels } from "@storyteller/tauri-api";

export type ModelList = Omit<PopoverItem, "selected">[];

const withIcon = (creatorIcon: any, fallback: any) => creatorIcon || fallback;

// Capability tag pills shown under video model rows.
const videoCapabilityBadges = (model: Model) => {
  if (model.kind !== "video_model") return undefined;
  const video = model as VideoModel;
  const badges = [
    ...(video.generateWithSound ? [{ label: "Audio Support" }] : []),
    ...(video.endFrame ? [{ label: "Start/End" }] : []),
    ...(video.supportsReferenceMode ? [{ label: "Reference" }] : []),
  ];
  return badges.length > 0 ? badges : undefined;
};

const buildItems = (models: Model[], fallbackIcon: any) =>
  models.map((model: Model) => ({
    label: model.selectorName,
    icon: withIcon(getCreatorListIcon(model.creator), fallbackIcon),
    description: model.selectorDescription,
    badges: videoCapabilityBadges(model),
    modelConfig: model.toLegacyModelConfig(), // Access to full object.
    model: model,
  }));

// De-dupe while keeping the declared order: the first model (GPT Image 1) is the
// default and stays at the top of every picker.
const inDeclaredOrder = <T extends Model>(models: T[]): T[] =>
  Array.from(new Set(models));

const imageIcon = <ImageIcon  className="h-4 w-4" />;

/**
 * Per-page model subsetting by CAPABILITY FLAGS (canTextToImage, canEditImages,
 * canEditAngles, the InstructiveEdit tag, etc.).
 *
 * Each builder is a pure function over a model list. React components consume
 * them through the `use*PageModelList` hooks, which run them against the list in
 * `useModelsStore`.
 */

export const buildTextToImagePageList = (imageModels: ImageModel[]): ModelList =>
  buildItems(
    inDeclaredOrder(imageModels.filter((m) => m.canTextToImage)),
    imageIcon,
  );

export const buildCanvas2dPageList = (imageModels: ImageModel[]): ModelList =>
  buildItems(
    inDeclaredOrder(
      imageModels.filter(
        (m) => m.canEditImages || m.tags?.includes(ModelTag.InstructiveEdit),
      ),
    ),
    imageIcon,
  );

export const buildStage3dPageList = (imageModels: ImageModel[]): ModelList =>
  buildItems(
    inDeclaredOrder(
      imageModels.filter((m) => m.tags?.includes(ModelTag.InstructiveEdit)),
    ),
    imageIcon,
  );

export const buildImageEditorPageList = (imageModels: ImageModel[]): ModelList =>
  buildItems(
    inDeclaredOrder(imageModels.filter((m) => m.canEditImages)),
    imageIcon,
  );

export const buildAnglesPageList = (imageModels: ImageModel[]): ModelList =>
  buildItems(
    inDeclaredOrder(imageModels.filter((m) => m.canEditAngles)),
    imageIcon,
  );

// publik API makes no video, 3D or splat output: these pickers are empty. The
// exports stay so older callers still compile.
export const buildImageToVideoPageList = (_videoModels: VideoModel[]): ModelList => [];

const IMAGE_TO_VIDEO_PAGE_MODEL_LIST: ModelList = [];

export const IMAGE_TO_3D_WORLD_PAGE_MODEL_LIST: ModelList = [];

export const IMAGE_TO_3D_OBJECT_PAGE_MODEL_LIST: ModelList = [];

// ---------------------------------------------------------------------------
// React hooks over the model store (`useModelsStore` in @storyteller/tauri-api).
// ---------------------------------------------------------------------------

export const useTextToImagePageModelList = (): ModelList => {
  const imageModels = useImageModels();
  return useMemo(() => buildTextToImagePageList(imageModels), [imageModels]);
};

export const useCanvas2dPageModelList = (): ModelList => {
  const imageModels = useImageModels();
  return useMemo(() => buildCanvas2dPageList(imageModels), [imageModels]);
};

export const useStage3dPageModelList = (): ModelList => {
  const imageModels = useImageModels();
  return useMemo(() => buildStage3dPageList(imageModels), [imageModels]);
};

export const useImageEditorPageModelList = (): ModelList => {
  const imageModels = useImageModels();
  return useMemo(() => buildImageEditorPageList(imageModels), [imageModels]);
};

export const useAnglesPageModelList = (): ModelList => {
  const imageModels = useImageModels();
  return useMemo(() => buildAnglesPageList(imageModels), [imageModels]);
};

export const useImageToVideoPageModelList = (): ModelList =>
  IMAGE_TO_VIDEO_PAGE_MODEL_LIST;
