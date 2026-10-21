import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublikResult } from "@storyteller/tauri-api";

const RESULTS: PublikResult[] = [
  {
    task_id: "t1",
    created_at: new Date().toISOString(),
    model: "nano_banana",
    prompt: "a lighthouse at dusk",
    images: [
      { token: "publik_t1_0", url: "asset://localhost/t1_0.png" },
      { token: "publik_t1_1", url: "asset://localhost/t1_1.png" },
    ],
    audio: null,
  },
  {
    task_id: "t2",
    created_at: new Date().toISOString(),
    model: "speech",
    prompt: "Welcome to the library.",
    images: [],
    audio: { token: "publik_t2_0", url: "asset://localhost/t2_0.mp3" },
  },
];

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));
vi.mock("@storyteller/tauri-api", () => ({
  PublikListResults: vi.fn(() => Promise.resolve(RESULTS)),
  DownloadMediaFile: vi.fn(() => Promise.resolve({ status: "success" })),
  MediaFileDelete: vi.fn(() => Promise.resolve({ status: "success" })),
  commandErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

import GalleryModal from "./gallery-modal";
import { galleryModalVisibleViewMode } from "./galleryModalSignals";

afterEach(() => {
  cleanup();
  galleryModalVisibleViewMode.value = false;
});

describe("GalleryModal", () => {
  it("renders closed with no props", () => {
    const { baseElement } = render(<GalleryModal />);
    expect(baseElement).toBeTruthy();
  });

  it("lists the local images and speech clips in view mode", async () => {
    galleryModalVisibleViewMode.value = true;
    await act(async () => {
      render(<GalleryModal mode="view" />);
    });

    expect(await screen.findAllByAltText("a lighthouse at dusk")).toHaveLength(2);
    expect(screen.getByText("Welcome to the library.")).toBeTruthy();
    expect(screen.queryByText(/log in/i)).toBeNull();
  });

  it("shows only images when the page forces the image filter", async () => {
    await act(async () => {
      render(
        <GalleryModal mode="select" isOpen forceFilter="image" />,
      );
    });

    expect(await screen.findAllByAltText("a lighthouse at dusk")).toHaveLength(2);
    expect(screen.queryByText("Welcome to the library.")).toBeNull();
  });

  it("selects an item in select mode and hands it back", async () => {
    const onSelectItem = vi.fn();
    const onUseSelected = vi.fn();
    const view = await act(async () =>
      render(
        <GalleryModal
          mode="select"
          isOpen
          forceFilter="image"
          selectedItemIds={[]}
          onSelectItem={onSelectItem}
          onUseSelected={onUseSelected}
        />,
      ),
    );

    const [firstImage] = await screen.findAllByAltText("a lighthouse at dusk");
    fireEvent.click(firstImage);
    expect(onSelectItem).toHaveBeenCalledWith("publik_t1_0");

    view.rerender(
      <GalleryModal
        mode="select"
        isOpen
        forceFilter="image"
        selectedItemIds={["publik_t1_0"]}
        onSelectItem={onSelectItem}
        onUseSelected={onUseSelected}
      />,
    );
    fireEvent.click(screen.getByText("Use selected"));
    expect(onUseSelected).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "publik_t1_0",
        fullImage: "asset://localhost/t1_0.png",
        batchImageToken: "publik_batch_t1",
      }),
    ]);
  });

  it("shows nothing for a kind the app does not make", async () => {
    await act(async () => {
      render(<GalleryModal mode="select" isOpen forceFilter="video" />);
    });

    expect(await screen.findByText("Nothing to show here.")).toBeTruthy();
  });
});
