import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { IMAGE_MODELS } from "@storyteller/model-list";
import { useModelPickerStyleStore } from "@storyteller/ui-popover";
import { ClassyModelSelector } from "./classy-model-selector";
import { useClassyModelSelectorStore } from "./classy-model-selector-store";
import { ModelPage } from "./model-pages";
import { ProviderSelector } from "./provider-selector";
import { buildTextToImagePageList } from "./model-selectors-for-pages";

const PAGE = ModelPage.TextToImage;
const ITEMS = buildTextToImagePageList(IMAGE_MODELS);
const GPT_IMAGE_1 = IMAGE_MODELS.find((model) => model.id === "gpt_image_1")!;
const NANO_BANANA = IMAGE_MODELS.find((model) => model.id === "nano_banana")!;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  // jsdom has no layout; give the menu a visible rect so its viewport clamp
  // and Headless UI visibility checks behave as they do in the app.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 100, 280, 40),
  );
  useClassyModelSelectorStore.setState({ selectedModels: {}, selectedProviders: {} });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useClassyModelSelectorStore.setState({ selectedModels: {}, selectedProviders: {} });
  useModelPickerStyleStore.getState().setStyle("grouped");
});

it("selects GPT Image 1 with publik API by default", async () => {
  render(<ClassyModelSelector items={ITEMS} page={PAGE} variant="embedded" />);

  await waitFor(() =>
    expect(useClassyModelSelectorStore.getState().selectedModels[PAGE]).toBe(GPT_IMAGE_1),
  );
  expect(useClassyModelSelectorStore.getState().selectedProviders[PAGE]?.[GPT_IMAGE_1.id])
    .toBe(GenerationProvider.Publik);
  expect(screen.getByRole("button", { name: /GPT Image 1/ })).toBeTruthy();
});

it.each(["grouped", "flat"] as const)(
  "shows no provider choice in the %s picker and picks Nano Banana with publik API",
  async (style) => {
    const user = userEvent.setup();
    useModelPickerStyleStore.getState().setStyle(style);
    render(<ClassyModelSelector items={ITEMS} page={PAGE} variant="embedded" />);

    await user.click(screen.getByRole("button", { name: /GPT Image 1/ }));
    if (style === "grouped" && !screen.queryByText(NANO_BANANA.selectorName, { exact: true })) {
      await user.click(screen.getByText("Google", { exact: false }));
    }
    const row = await screen.findByText(NANO_BANANA.selectorName, { exact: true });
    await user.hover(row);
    expect(screen.queryByText("Select Provider")).toBeNull();
    expect(screen.queryByText("publik API")).toBeNull();

    await user.click(row);
    expect(useClassyModelSelectorStore.getState().selectedModels[PAGE]).toBe(NANO_BANANA);
    expect(useClassyModelSelectorStore.getState().selectedProviders[PAGE]?.[NANO_BANANA.id])
      .toBe(GenerationProvider.Publik);
  },
);

it("shows no provider line in the floating picker", async () => {
  render(<ClassyModelSelector items={ITEMS} page={PAGE} variant="floating" />);
  await waitFor(() =>
    expect(useClassyModelSelectorStore.getState().selectedModels[PAGE]).toBe(GPT_IMAGE_1),
  );
  expect(screen.queryByText("via")).toBeNull();
  expect(screen.queryByText("publik API")).toBeNull();
});

it("renders no provider selector when publik API is the only provider", () => {
  const { container } = render(<ProviderSelector page={PAGE} model={GPT_IMAGE_1} />);
  expect(container.innerHTML).toBe("");
});
