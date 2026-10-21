import { useEffect } from "react";
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  PublikListResults,
  commandErrorMessage,
  type PublikResult,
} from "@storyteller/tauri-api";
import type { GalleryItem } from "./gallery-modal";

// The local library: every image and speech clip that publik API made on this
// computer. Rust stores the files and lists them (`publik_list_results_command`,
// newest first); nothing comes from an ArtCraft account. One store feeds the
// library modal, the lightbox and the create-page feeds, so a refresh or a
// delete shows everywhere at once.

/** A library item. Every field the feeds and the lightbox read is set. */
export interface LocalGalleryItem extends GalleryItem {
  fullImage: string;
  mediaClass: "image" | "audio";
  modelId: string;
  prompt: string;
  mediaTokens: string[];
  imageUrls: string[];
}

/** The batch token of a stored result (shared by every image of one request). */
export const publikBatchToken = (taskId: string) => `publik_batch_${taskId}`;

/** Display names for the models a stored result can come from. */
export const PUBLIK_MODEL_NAMES: Record<string, string> = {
  gpt_image_1: "GPT Image 1",
  nano_banana: "Nano Banana",
  speech: "Speech",
};

export const publikModelName = (modelId: string | undefined | null) =>
  (modelId && PUBLIK_MODEL_NAMES[modelId]) || modelId || "";

/**
 * Stored results → library items, newest first: one item per image (all images
 * of a batch share `batchImageToken`, `mediaTokens` and `imageUrls`) and one
 * audio item per speech clip.
 */
export function publikResultsToGalleryItems(
  results: readonly PublikResult[],
): LocalGalleryItem[] {
  const items: LocalGalleryItem[] = [];
  for (const result of results) {
    const prompt = (result.prompt ?? "").trim();
    const images = result.images ?? [];
    const mediaTokens = images.map((image) => image.token);
    const imageUrls = images.map((image) => image.url);
    images.forEach((image) => {
      items.push({
        id: image.token,
        label: prompt || "Image",
        thumbnail: image.url,
        fullImage: image.url,
        createdAt: result.created_at,
        mediaClass: "image",
        modelId: result.model,
        prompt,
        batchImageToken: publikBatchToken(result.task_id),
        mediaTokens,
        imageUrls,
      });
    });
    if (result.audio) {
      items.push({
        id: result.audio.token,
        label: prompt || "Speech",
        thumbnail: null,
        fullImage: result.audio.url,
        createdAt: result.created_at,
        mediaClass: "audio",
        modelId: result.model,
        prompt,
        mediaTokens: [result.audio.token],
        imageUrls: [],
      });
    }
  }
  return items;
}

interface PublikLibraryState {
  items: LocalGalleryItem[];
  /** True until the first list call returns (or fails). */
  isInitialLoading: boolean;
  isLoading: boolean;
  /** The last list failure, as one sentence. Null when the list loaded. */
  error: string | null;
  refresh: () => Promise<void>;
  /** Drop one item (after a delete) without a new list call. */
  removeItem: (token: string) => void;
}

let refreshInFlight: Promise<void> | null = null;
let refreshQueued = false;

export const usePublikLibraryStore = create<PublikLibraryState>((set, get) => ({
  items: [],
  isInitialLoading: true,
  isLoading: false,
  error: null,
  refresh: async () => {
    // One call at a time; a refresh asked for during a call runs once after it.
    if (refreshInFlight) {
      refreshQueued = true;
      return refreshInFlight;
    }
    set({ isLoading: true });
    refreshInFlight = (async () => {
      try {
        const results = await PublikListResults();
        set({
          items: publikResultsToGalleryItems(results ?? []),
          error: null,
        });
      } catch (err) {
        set({
          error: commandErrorMessage(
            err,
            "Could not open your library. Close this window and open it again.",
          ),
        });
      } finally {
        set({ isLoading: false, isInitialLoading: false });
        refreshInFlight = null;
        if (refreshQueued) {
          refreshQueued = false;
          void get().refresh();
        }
      }
    })();
    return refreshInFlight;
  },
  removeItem: (token: string) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== token),
    })),
}));

/** Find a library item (and its batch) by token. */
export const findLibraryItem = (token: string | null | undefined) =>
  token
    ? usePublikLibraryStore.getState().items.find((item) => item.id === token)
    : undefined;

// ── Live updates ──────────────────────────────────────────────────────────────
// Refresh when Rust reports a finished image or a deleted file. Registered once
// for the whole app, the first time a library consumer mounts.

let listening = false;

export function ensurePublikLibraryListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const refresh = () => void usePublikLibraryStore.getState().refresh();
  const safeListen = (event: string, handler: (payload: unknown) => void) => {
    try {
      listen(event, (e) => handler(e.payload)).catch(() => {
        // Not running inside Tauri (tests, browser preview): no live updates.
      });
    } catch {
      // Not running inside Tauri.
    }
  };
  safeListen("text_to_image_generation_complete_event", refresh);
  safeListen("generation-complete-event", refresh);
  safeListen("media_file_deleted_event", (payload) => {
    const data = payload as
      | { data?: { media_file_token?: string }; media_file_token?: string }
      | undefined;
    const token = data?.data?.media_file_token ?? data?.media_file_token;
    if (token) usePublikLibraryStore.getState().removeItem(token);
    refresh();
  });
}

/** The library for React consumers. Loads on mount and keeps itself up to date. */
export function usePublikLibrary() {
  useEffect(() => {
    ensurePublikLibraryListening();
    void usePublikLibraryStore.getState().refresh();
  }, []);
  const items = usePublikLibraryStore((s) => s.items);
  const isInitialLoading = usePublikLibraryStore((s) => s.isInitialLoading);
  const isLoading = usePublikLibraryStore((s) => s.isLoading);
  const error = usePublikLibraryStore((s) => s.error);
  const refresh = usePublikLibraryStore((s) => s.refresh);
  return { items, isInitialLoading, isLoading, error, refresh };
}
