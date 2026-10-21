import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { ModelPage } from "./model-pages";
import {
  getSelectedProviderForModel,
  useClassyModelSelectorStore,
  useSelectedProviderForModel,
} from "./classy-model-selector-store";

const STALE_SELECTIONS = [
  { page: ModelPage.TextToImage, modelId: "gpt_image_1", provider: GenerationProvider.Sora },
  { page: ModelPage.TextToImage, modelId: "gpt_image_1", provider: GenerationProvider.Artcraft },
  { page: ModelPage.TextToImage, modelId: "nano_banana", provider: GenerationProvider.Fal },
  { page: ModelPage.Canvas2D, modelId: "gpt_image_1", provider: GenerationProvider.Midjourney },
];

afterEach(() => {
  cleanup();
  useClassyModelSelectorStore.setState({ selectedModels: {}, selectedProviders: {} });
});

it.each(STALE_SELECTIONS)(
  "uses publik API for a stale $provider selection of $modelId",
  ({ page, modelId, provider }) => {
    useClassyModelSelectorStore.setState({
      selectedProviders: { [page]: { [modelId]: provider } },
    });
    const { result } = renderHook(() => useSelectedProviderForModel(page, modelId));
    expect(result.current).toBe(GenerationProvider.Publik);
    expect(getSelectedProviderForModel(page, modelId)).toBe(GenerationProvider.Publik);

    act(() => useClassyModelSelectorStore.getState().setSelectedProvider(page, modelId, provider));
    expect(useClassyModelSelectorStore.getState().selectedProviders[page]?.[modelId])
      .toBe(GenerationProvider.Publik);
  },
);

it("uses publik API before any provider is stored", () => {
  const page = ModelPage.TextToImage;
  const { result } = renderHook(() => useSelectedProviderForModel(page, "gpt_image_1"));
  expect(result.current).toBe(GenerationProvider.Publik);
  expect(getSelectedProviderForModel(page, "gpt_image_1")).toBe(GenerationProvider.Publik);
  const { result: noModel } = renderHook(() => useSelectedProviderForModel(page, undefined));
  expect(noModel.current).toBeUndefined();
});
