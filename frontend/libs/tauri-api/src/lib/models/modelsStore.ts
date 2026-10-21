// Shared model store: the single source of truth for the model dropdowns.
//
// publik API is the only provider, and the frontend list (`IMAGE_MODELS` in
// `@storyteller/model-list`) is the whole catalog: GPT Image 1 and Nano Banana.
// Nothing is fetched from a backend listing. Video models are not offered.

import { create } from "zustand";
import {
  ImageModel,
  VideoModel,
  IMAGE_MODELS,
  ALL_MODELS_LIST,
} from "@storyteller/model-list";

export interface ModelsStoreState {
  imageModels: ImageModel[];
  videoModels: VideoModel[];
}

export const useModelsStore = create<ModelsStoreState>(() => ({
  imageModels: IMAGE_MODELS,
  videoModels: [],
}));

// Hook selectors for React consumers.
export const useImageModels = (): ImageModel[] => useModelsStore((s) => s.imageModels);
export const useVideoModels = (): VideoModel[] => useModelsStore((s) => s.videoModels);

// History and "recreate" look a model up by its id or Tauri id.
export function findDesktopModel(modelId: string) {
  const { imageModels, videoModels } = useModelsStore.getState();
  return [...imageModels, ...videoModels, ...ALL_MODELS_LIST]
    .find((model) => model.tauriId === modelId || model.id === modelId);
}
