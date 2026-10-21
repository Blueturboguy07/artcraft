import { describe, expect, it, vi } from "vitest";
import type { PublikResult } from "@storyteller/tauri-api";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));
vi.mock("@storyteller/tauri-api", () => ({
  PublikListResults: vi.fn(() => Promise.resolve([])),
  commandErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

import {
  publikBatchToken,
  publikModelName,
  publikResultsToGalleryItems,
} from "./publikLibrary";

const BATCH: PublikResult = {
  task_id: "t1",
  created_at: "2026-10-21T10:00:00Z",
  model: "gpt_image_1",
  prompt: "  a red fox in snow  ",
  images: [
    { token: "publik_t1_0", url: "asset://localhost/t1_0.png" },
    { token: "publik_t1_1", url: "asset://localhost/t1_1.png" },
    { token: "publik_t1_2", url: "asset://localhost/t1_2.png" },
  ],
  audio: null,
};

const SPEECH: PublikResult = {
  task_id: "t2",
  created_at: "2026-10-21T09:00:00Z",
  model: "speech",
  prompt: "Hello from publik.",
  images: [],
  audio: { token: "publik_t2_0", url: "asset://localhost/t2_0.mp3" },
};

describe("publikResultsToGalleryItems", () => {
  it("makes one image item per image of a 3-image batch", () => {
    const items = publikResultsToGalleryItems([BATCH]);

    expect(items.map((item) => item.id)).toEqual([
      "publik_t1_0",
      "publik_t1_1",
      "publik_t1_2",
    ]);
    for (const [index, item] of items.entries()) {
      expect(item).toMatchObject({
        label: "a red fox in snow",
        prompt: "a red fox in snow",
        thumbnail: BATCH.images[index].url,
        fullImage: BATCH.images[index].url,
        createdAt: "2026-10-21T10:00:00Z",
        mediaClass: "image",
        modelId: "gpt_image_1",
        batchImageToken: "publik_batch_t1",
      });
      // Every image knows its whole batch, in order.
      expect(item.mediaTokens).toEqual([
        "publik_t1_0",
        "publik_t1_1",
        "publik_t1_2",
      ]);
      expect(item.imageUrls).toEqual(BATCH.images.map((image) => image.url));
    }
  });

  it("makes one audio item for a speech result", () => {
    const [item, ...rest] = publikResultsToGalleryItems([SPEECH]);

    expect(rest).toHaveLength(0);
    expect(item).toEqual({
      id: "publik_t2_0",
      label: "Hello from publik.",
      thumbnail: null,
      fullImage: "asset://localhost/t2_0.mp3",
      createdAt: "2026-10-21T09:00:00Z",
      mediaClass: "audio",
      modelId: "speech",
      prompt: "Hello from publik.",
      mediaTokens: ["publik_t2_0"],
      imageUrls: [],
    });
  });

  it("keeps the newest-first order of the results", () => {
    const items = publikResultsToGalleryItems([BATCH, SPEECH]);
    expect(items.map((item) => item.id)).toEqual([
      "publik_t1_0",
      "publik_t1_1",
      "publik_t1_2",
      "publik_t2_0",
    ]);
  });

  it("labels an item with no prompt by its kind", () => {
    const [image] = publikResultsToGalleryItems([{ ...BATCH, prompt: "" }]);
    const [speech] = publikResultsToGalleryItems([{ ...SPEECH, prompt: "" }]);
    expect(image.label).toBe("Image");
    expect(speech.label).toBe("Speech");
  });
});

describe("publik names", () => {
  it("builds the batch token from the task id", () => {
    expect(publikBatchToken("abc")).toBe("publik_batch_abc");
  });

  it("shows a display name for each model", () => {
    expect(publikModelName("gpt_image_1")).toBe("GPT Image 1");
    expect(publikModelName("nano_banana")).toBe("Nano Banana");
    expect(publikModelName("speech")).toBe("Speech");
    expect(publikModelName("other_model")).toBe("other_model");
    expect(publikModelName(undefined)).toBe("");
  });
});
