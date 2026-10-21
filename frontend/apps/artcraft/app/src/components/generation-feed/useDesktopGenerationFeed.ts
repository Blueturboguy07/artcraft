import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  findDesktopModel,
  GetTaskQueue,
  MarkTaskAsDismissed,
} from "@storyteller/tauri-api";
import type { TaskQueueItem } from "@storyteller/tauri-api";
import { useTextToImageGenerationCompleteEvent } from "@storyteller/tauri-events";
import { ALL_MODELS_LIST, getModelDisplayName } from "@storyteller/model-list";
import {
  publikBatchToken,
  usePublikLibrary,
} from "@storyteller/ui-gallery-modal";
import type {
  FailedJob,
  GalleryItem,
  InProgressJob,
} from "@storyteller/ui-generation-list";
import {
  getMetaForTask,
  cleanupOldEntries,
} from "../signaled/TopBar/taskEnqueueMeta";

// The feed of a create page:
// - in progress and failed: the local task queue (polled every 5 s and reloaded
//   on Rust events and local enqueues);
// - just finished: the images in the "image complete" event, shown at once;
// - history: the local library (`publik_list_results_command`).
// Nothing comes from an ArtCraft account.

const POLL_INTERVAL_MS = 5000;

const FAILED_STATUSES = new Set([
  "complete_failure",
  "attempt_failed",
  "dead",
  "cancelled_by_user",
  "cancelled_by_provider",
  "cancelled_by_us",
]);

const FAILURE_REASON_LABEL: Record<string, string> = {
  rule_bans_user_image: "The image is not allowed by the content policy.",
  rule_bans_user_image_with_faces: "Images with faces are not allowed.",
  rule_bans_user_text_prompt: "The prompt is not allowed by the content policy.",
  rule_bans_user_content: "The request is not allowed by the content policy.",
  rule_bans_generated_content: "The result is not allowed by the content policy.",
  generation_failed: "The request failed.",
  unknown: "The request failed.",
};

// ── Hook ───────────────────────────────────────────────────────────────────

export function useDesktopGenerationFeed(options: {
  /** "video" is accepted for old pages; this app makes images only. */
  mediaType: "image" | "video";
}) {
  const { mediaType } = options;
  const library = usePublikLibrary();

  const [inProgress, setInProgress] = useState<InProgressJob[]>([]);
  const [failed, setFailed] = useState<FailedJob[]>([]);
  const [justCompleted, setJustCompleted] = useState<GalleryItem[]>([]);

  // Snapshot per-task durations so the progress bar stays stable.
  const durationsRef = useRef<Map<string, number>>(new Map());
  const prevCompletedIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);
  // Failed tasks dismissed here. Hidden until the dismissal shows in a poll.
  const dismissedRef = useRef<Set<string>>(new Set());

  const refreshLibrary = library.refresh;

  /** Prepend completed items (no duplicates) ahead of the library refresh. */
  const addCompletedItems = useCallback((items: GalleryItem[]) => {
    if (items.length === 0) return;
    setJustCompleted((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const fresh = items.filter((i) => !existingIds.has(i.id));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev];
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const { tasks } = await GetTaskQueue();
      const filtered = tasks.filter(
        (t) =>
          getTaskMediaType(t) === mediaType && !dismissedRef.current.has(t.id),
      );

      const newInProgress = filtered
        .filter(
          (t) => t.task_status === "pending" || t.task_status === "started",
        )
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map((t) => taskToInProgress(t, mediaType, durationsRef.current));

      const newFailed = filtered
        .filter((t) => FAILED_STATUSES.has(String(t.task_status)))
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
        .map((t) => taskToFailed(t, mediaType));

      const completedTasks = filtered.filter(
        (t) => String(t.task_status) === "complete_success",
      );

      // A task finished since the last poll: show its file now and load the
      // library, which has every image of the batch. Skip the first load: the
      // history comes from the library.
      if (initialLoadDoneRef.current) {
        const newOnes = completedTasks.filter(
          (t) => !prevCompletedIdsRef.current.has(t.id),
        );
        if (newOnes.length > 0) {
          addCompletedItems(newOnes.flatMap((t) => taskToGalleryItems(t, mediaType)));
          void refreshLibrary();
        }
      }
      initialLoadDoneRef.current = true;
      prevCompletedIdsRef.current = new Set(completedTasks.map((t) => t.id));

      // Drop duration snapshots for tasks no longer in progress.
      const activeIds = new Set(newInProgress.map((j) => j.id));
      for (const id of Array.from(durationsRef.current.keys())) {
        if (!activeIds.has(id)) durationsRef.current.delete(id);
      }

      setInProgress(newInProgress);
      setFailed(newFailed);
    } catch {
      // The next poll tries again.
    }
  }, [mediaType, addCompletedItems, refreshLibrary]);

  // Rust sends the finished images in the event, so they show at once. The
  // library store refreshes on the same event and fills in the prompt and the
  // model. NB: the tauri-events hook subscribes once on mount, so the callback
  // must only capture stable values.
  useTextToImageGenerationCompleteEvent(async (event) => {
    if (mediaType !== "image" || !event.generated_images?.length) return;
    const createdAt = new Date().toISOString();
    const mediaTokens = event.generated_images.map((img) => img.media_token);
    const imageUrls = event.generated_images.map((img) => img.cdn_url);
    addCompletedItems(
      event.generated_images.map((img) => {
        const taskId = taskIdFromToken(img.media_token);
        return {
          id: img.media_token,
          label: "Image",
          thumbnail: img.cdn_url,
          fullImage: img.cdn_url,
          createdAt,
          mediaClass: "image",
          // Set (even empty) so the feed shows it and does no prompt lookup.
          prompt: "",
          batchImageToken: taskId ? publikBatchToken(taskId) : undefined,
          mediaTokens,
          imageUrls,
        } as GalleryItem;
      }),
    );
    void load();
  });

  // Poll, and reload on Rust events and local "task-queue-update" events
  // (the pages send one right after they start a request).
  useEffect(() => {
    cleanupOldEntries();
    void load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);

    const handleTaskUpdate = () => void load();
    window.addEventListener("task-queue-update", handleTaskUpdate);

    let cancelled = false;
    const safeListen = (event: string): Promise<UnlistenFn | null> =>
      listen(event, () => {
        if (!cancelled) void load();
      }).catch(() => null);
    const unlistenComplete = safeListen("generation-complete-event");
    const unlistenFailed = safeListen("generation-failed-event");

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("task-queue-update", handleTaskUpdate);
      unlistenComplete.then((f) => f?.());
      unlistenFailed.then((f) => f?.());
    };
  }, [load]);

  const dismissFailed = useCallback(async (taskId: string) => {
    dismissedRef.current.add(taskId);
    setFailed((prev) => prev.filter((f) => f.id !== taskId));
    try {
      await MarkTaskAsDismissed(taskId);
    } catch {
      // The local filter hides it already.
    }
  }, []);

  // The library: history for this page's kind, and the stored copy of each
  // just-finished item (it has the prompt, the model and the whole batch).
  const libraryById = useMemo(
    () => new Map(library.items.map((item) => [item.id, item])),
    [library.items],
  );

  // The library list is current: a local item missing from it was deleted.
  const libraryIsCurrent =
    !library.isInitialLoading && !library.isLoading && !library.error;

  const newlyCompleted = useMemo(
    () =>
      justCompleted
        .filter(
          (item) =>
            !libraryIsCurrent ||
            libraryById.has(item.id) ||
            !isLibraryToken(item.id),
        )
        .map((item) => {
          const stored = libraryById.get(item.id);
          return stored
            ? ({ ...stored, createdAt: item.createdAt } as GalleryItem)
            : item;
        }),
    [justCompleted, libraryById, libraryIsCurrent],
  );

  const history = useMemo<GalleryItem[]>(
    () =>
      mediaType === "image"
        ? library.items.filter((item) => item.mediaClass === "image")
        : [],
    [library.items, mediaType],
  );

  return {
    inProgress,
    failed,
    newlyCompleted,
    /** Stored results of this page's kind, newest first. */
    history,
    /** True until the library loads the first time. */
    isHistoryLoading: library.isInitialLoading,
    /** The library failure, as one sentence, or null. */
    historyError: library.error,
    dismissFailed,
    refresh: load,
  };
}

// ── Task mapping helpers ────────────────────────────────────────────────────

function getTaskMediaType(t: TaskQueueItem): "image" | "video" | "other" {
  const taskTypeStr = t.task_type ? String(t.task_type).toLowerCase() : "";
  const is3D =
    taskTypeStr.includes("3d") ||
    taskTypeStr.includes("object") ||
    taskTypeStr.includes("dimensional") ||
    taskTypeStr.includes("gaussian");
  if (is3D) return "other";
  if (taskTypeStr.includes("video")) return "video";
  if (taskTypeStr.includes("image")) return "image";
  return "other";
}

function getTaskModelLabel(t: TaskQueueItem): string {
  const modelType = t.model_type ? String(t.model_type) : "";
  if (!modelType) return "Image";
  return findDesktopModel(modelType)?.fullName ?? getModelDisplayName(modelType);
}

function taskToInProgress(
  t: TaskQueueItem,
  mediaType: "image" | "video",
  durations: Map<string, number>,
): InProgressJob {
  const now = Date.now();
  const createdMs = t.created_at.getTime();

  let duration = durations.get(t.id);
  if (!duration) {
    const model = t.model_type
      ? ALL_MODELS_LIST.find(
          (m) =>
            m.tauriId === String(t.model_type) || m.id === String(t.model_type),
        )
      : undefined;
    duration = model?.progressBarTime ?? 30000;
    durations.set(t.id, duration);
  }

  const elapsed = now - createdMs;
  const progress = Math.min(95, Math.max(0, (elapsed / duration) * 100));
  const meta = getMetaForTask(
    t.id,
    t.model_type ? String(t.model_type) : undefined,
    createdMs,
  );

  return {
    id: t.id,
    prompt: meta?.prompt ?? "",
    modelId: t.model_type ? String(t.model_type) : "",
    modelLabel: getTaskModelLabel(t),
    progress,
    estimatedTimeLeftMs: Math.max(0, duration - elapsed),
    createdAt: t.created_at.toISOString(),
    // One request can make a batch: the pending row reads "Making N images".
    batchCount: meta?.batchCount,
    mediaClass: mediaType,
  };
}

function taskToFailed(
  t: TaskQueueItem,
  mediaType: "image" | "video",
): FailedJob {
  const fr = t.failure_reason;
  const failureReason = fr
    ? FAILURE_REASON_LABEL[fr.failure_type] || fr.failure_message || undefined
    : undefined;
  const failureMessage =
    fr?.failure_message && fr.failure_type !== "unknown"
      ? fr.failure_message
      : undefined;
  const meta = getMetaForTask(
    t.id,
    t.model_type ? String(t.model_type) : undefined,
    t.created_at.getTime(),
  );

  return {
    id: t.id,
    prompt: meta?.prompt ?? "",
    modelId: t.model_type ? String(t.model_type) : "",
    modelLabel: getTaskModelLabel(t),
    failureReason,
    failureMessage,
    status: String(t.task_status),
    createdAt: t.created_at.toISOString(),
    refImageUrl: meta?.refImageUrls?.[0],
    mediaClass: mediaType,
  };
}

/** The file of a finished task. The library refresh adds the rest of the batch. */
function taskToGalleryItems(
  t: TaskQueueItem,
  mediaType: "image" | "video",
): GalleryItem[] {
  const file = t.completed_item?.primary_media_file;
  if (!file?.token || !file.cdn_url) return [];
  const meta = getMetaForTask(
    t.id,
    t.model_type ? String(t.model_type) : undefined,
    t.created_at.getTime(),
  );
  return [
    {
      id: file.token,
      label: meta?.prompt || "Image",
      thumbnail: file.cdn_url,
      fullImage: file.cdn_url,
      // Task creation time: the finished row takes the pending row's place.
      createdAt: t.created_at.toISOString(),
      mediaClass: mediaType,
      modelId: t.model_type ? String(t.model_type) : undefined,
      prompt: meta?.prompt ?? "",
      batchImageToken: t.completed_item?.maybe_batch_token,
    },
  ];
}

/** Local tokens are `publik_<task>_<n>`. Returns `<task>`, or null. */
function taskIdFromToken(token: string): string | null {
  const match = /^publik_(.+)_\d+$/.exec(token);
  return match ? match[1] : null;
}

function isLibraryToken(token: string): boolean {
  return token.startsWith("publik_");
}
