import { Modal } from "@storyteller/ui-modal";
import { LightboxModal } from "@storyteller/ui-lightbox-modal";
import { Button } from "@storyteller/ui-button";
import { CloseButton } from "@storyteller/ui-close-button";
import { LoadingSpinner } from "@storyteller/ui-loading-spinner";
import { toast } from "@storyteller/ui-toaster";
import {
  DownloadMediaFile,
  MediaFileDelete,
  commandErrorMessage,
} from "@storyteller/tauri-api";
import { useSignals } from "@preact/signals-react/runtime";
import { CheckIcon, MusicIcon, RefreshCwIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  galleryModalDraggingUnder,
  galleryReopenAfterDragSignal,
  galleryModalVisibleViewMode,
  galleryModalVisibleDuringDrag,
  galleryModalLightboxMediaId,
  galleryModalLightboxImage,
  galleryModalLightboxVisible,
  galleryModalLightboxNavPrev,
  galleryModalLightboxNavNext,
} from "./galleryModalSignals";
import galleryDnd from "./galleryDnd";
import {
  publikModelName,
  usePublikLibrary,
  usePublikLibraryStore,
  type LocalGalleryItem,
} from "./publikLibrary";

// "My Library": every image and speech clip that publik API made on this
// computer, newest first. The list comes from Rust (`publik_list_results_command`);
// there is no account, no folders and no share links.
//
// Two modes:
// - "view": the library window (top bar). Opens the lightbox, drags images onto
//   the canvas or the moodboard.
// - "select": a picker for a page (reference images, base image). The page
//   gets the selected items through `onUseSelected`.

export interface GalleryItem {
  /** The local token (`publik_<task>_<n>`). Pages send it back to Rust. */
  id: string;
  label: string;
  thumbnail: string | null;
  // Thumbnail template is not a usable URL yet. It has some variables
  // like `{WIDTH}` which must be replaced downstream.
  thumbnailUrlTemplate?: string;
  fullImage?: string | null;
  createdAt: string;
  mediaClass?: string;
  assetType?: string;
  isUpload?: boolean;
  batchImageToken?: string;
  mediaTokens?: string[];
  imageUrls?: string[];
  /** Prompt token, when the list endpoint returns one (used by audio tiles). */
  promptToken?: string;
  /** Duration for audio/video items, when known. */
  durationMillis?: number;
  /** The model that made the item (`gpt_image_1`, `nano_banana`, `speech`). */
  modelId?: string;
  /** The prompt of the request, for local items. */
  prompt?: string;
}

type ModalMode = "select" | "view";

type LibraryFilter = "all" | "image" | "audio";

/** Legacy media callbacks. The library accepts them and does not use them. */
type IgnoredMediaCallback = (
  url: string,
  media_id?: string,
) => Promise<void> | void;

export interface GalleryModalProps {
  onClose?: () => void;
  mode?: ModalMode;
  selectedItemIds?: string[];
  /** Select mode: ids that are already added to the destination (e.g. the
   *  reference deck). Shown greyed out with an "Added" badge and unclickable,
   *  so the same media file can't be picked twice. */
  disabledItemIds?: string[];
  onSelectItem?: (id: string) => void;
  maxSelections?: number;
  onUseSelected?: (selectedItems: GalleryItem[]) => void;
  useSelectedLoading?: boolean;
  isOpen?: boolean;
  /** Lock the list to one kind: "image" or "audio". Other kinds show nothing. */
  forceFilter?: string;
  /** Hide the "All / Images / Speech" switch. */
  hideFilter?: boolean;
  /** Lightbox "Edit Image". */
  onEditClicked?: (url: string, media_id?: string) => Promise<void> | void;
  /** Lightbox "Use as reference". */
  onUseAsReferenceClicked?: (
    url: string,
    media_id?: string,
  ) => Promise<void> | void;
  /** Lightbox "Use this prompt": put the prompt (and model) back in the prompt box. */
  onReusePromptClicked?: (prompt: string, modelId?: string) => void;
  /** Delete a file by token. Default: `media_file_delete_command`. */
  onDeleteMedia?: (id: string) => Promise<unknown>;

  /** @deprecated There is no sign-in. Ignored. */
  onLoginClick?: () => void;
  /** @deprecated "Download" saves the local file through Rust. Ignored. */
  onDownloadClicked?: (
    url: string,
    mediaClass?: string,
    model?: string,
  ) => Promise<void>;
  /** @deprecated Ignored. */
  onAddToSceneClicked?: (
    url: string,
    media_id: string | undefined,
  ) => Promise<void>;
  /** @deprecated No video. Ignored. */
  onTurnIntoVideoClicked?: IgnoredMediaCallback;
  /** @deprecated Ignored. */
  onRemoveBackgroundClicked?: IgnoredMediaCallback;
  /** @deprecated No 3D. Ignored. */
  onMake3DObjectClicked?: IgnoredMediaCallback;
  /** @deprecated No 3D. Ignored. */
  onMake3DWorldClicked?: IgnoredMediaCallback;
  /** @deprecated Use `onReusePromptClicked`. Ignored. */
  onRecreateClicked?: (data: {
    promptData: unknown;
    mediaClass: string | undefined;
  }) => void;
  /** @deprecated The library listens to Rust events itself. Ignored. */
  subscribeToMediaEvents?: (handlers: {
    onGenerationComplete: () => void;
    onMediaDeleted: (mediaId: string) => void;
  }) => () => void;
}

const EMPTY_IDS: string[] = [];

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "audio", label: "Speech" },
];

/** No cloud cache exists any more. Kept so old callers (sign-out) still build. */
export const clearGalleryCache = () => {
  // Nothing to clear: the library lives on this computer.
};

export const GalleryModal = React.memo(
  ({
    onClose,
    mode = "view",
    selectedItemIds = EMPTY_IDS,
    disabledItemIds = EMPTY_IDS,
    onSelectItem,
    maxSelections = 4,
    onUseSelected,
    useSelectedLoading,
    isOpen,
    forceFilter,
    hideFilter,
    onEditClicked,
    onUseAsReferenceClicked,
    onReusePromptClicked,
    onDeleteMedia,
  }: GalleryModalProps) => {
    useSignals();
    const { items, isInitialLoading, isLoading, error, refresh } =
      usePublikLibrary();

    const open =
      mode === "view"
        ? galleryModalVisibleViewMode.value
        : typeof isOpen === "boolean"
          ? isOpen
          : true;

    // Load the newest list each time the window opens.
    useEffect(() => {
      if (open) void refresh();
    }, [open, refresh]);

    const lockedFilter = toLockedFilter(forceFilter);
    const [chosenFilter, setChosenFilter] = useState<LibraryFilter>("all");
    const filter: LibraryFilter | "none" = lockedFilter ?? chosenFilter;

    const visibleItems = useMemo(
      () =>
        filter === "none"
          ? []
          : filter === "all"
            ? items
            : items.filter((item) => item.mediaClass === filter),
      [items, filter],
    );

    const groups = useMemo(() => groupByDay(visibleItems), [visibleItems]);

    // ── Select mode ──────────────────────────────────────────────────────────
    const handleTileSelect = useCallback(
      (item: LocalGalleryItem) => {
        if (disabledItemIds.includes(item.id)) return;
        const isSelected = selectedItemIds.includes(item.id);
        if (!isSelected && selectedItemIds.length >= maxSelections) {
          if (maxSelections === 1 && selectedItemIds.length === 1) {
            // Single pick: swap the selection.
            onSelectItem?.(selectedItemIds[0]);
          } else {
            toast.error(
              `You can select ${maxSelections} item${maxSelections === 1 ? "" : "s"} only.`,
            );
            return;
          }
        }
        onSelectItem?.(item.id);
      },
      [disabledItemIds, selectedItemIds, maxSelections, onSelectItem],
    );

    const handleUseSelected = () => {
      const selected = selectedItemIds
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is LocalGalleryItem => !!item);
      onUseSelected?.(selected);
    };

    const handleDeselectAll = () => {
      selectedItemIds.forEach((id) => onSelectItem?.(id));
    };

    // ── View mode: lightbox ──────────────────────────────────────────────────
    const openLightbox = useCallback((item: GalleryItem) => {
      galleryModalLightboxNavPrev.value = null;
      galleryModalLightboxNavNext.value = null;
      galleryModalLightboxImage.value = item;
      galleryModalLightboxMediaId.value = item.id;
      galleryModalLightboxVisible.value = true;
    }, []);

    const closeLightbox = useCallback(() => {
      galleryModalLightboxVisible.value = false;
      galleryModalLightboxNavPrev.value = null;
      galleryModalLightboxNavNext.value = null;
    }, []);

    const closeGallery = useCallback(() => {
      galleryModalVisibleViewMode.value = false;
      galleryModalVisibleDuringDrag.value = false;
      closeLightbox();
    }, [closeLightbox]);

    const closeModal = () => {
      if (mode === "view") {
        if (onClose) onClose();
        else galleryModalVisibleViewMode.value = false;
      } else {
        onClose?.();
      }
    };

    const lightboxItem = galleryModalLightboxImage.value as GalleryItem | null;
    const lightboxId = galleryModalLightboxMediaId.value ?? lightboxItem?.id;
    // Prefer the stored item: it has the batch, prompt and model. Pages that
    // open the lightbox (feeds, task queue) may set fewer fields.
    const storedItem = lightboxId
      ? items.find((item) => item.id === lightboxId)
      : undefined;
    const shown: GalleryItem | null = storedItem ?? lightboxItem;
    const shownUrl = shown?.fullImage || shown?.thumbnail || null;

    const lightboxIndex = shown
      ? visibleItems.findIndex((item) => item.id === shown.id)
      : -1;
    const prevItem = lightboxIndex > 0 ? visibleItems[lightboxIndex - 1] : null;
    const nextItem =
      lightboxIndex >= 0 && lightboxIndex < visibleItems.length - 1
        ? visibleItems[lightboxIndex + 1]
        : null;

    const showItem = (item: GalleryItem) => {
      galleryModalLightboxImage.value = item;
      galleryModalLightboxMediaId.value = item.id;
    };

    const handleDownload = async (token: string) => {
      try {
        await DownloadMediaFile(token);
        toast.success("Saved to your downloads folder.");
      } catch (err) {
        toast.error(commandErrorMessage(err, "Could not save the file. Try again."));
      }
    };

    const handleDelete = async (token: string): Promise<boolean> => {
      try {
        const result = onDeleteMedia
          ? await onDeleteMedia(token)
          : await MediaFileDelete(token);
        throwIfCommandFailed(result);
      } catch (err) {
        toast.error(
          commandErrorMessage(err, "Could not delete the file. Try again."),
        );
        return false;
      }
      // Move the lightbox to a neighbor (or close it) before the item goes.
      if (shown?.id === token || galleryModalLightboxMediaId.value === token) {
        const neighbor = nextItem ?? prevItem;
        if (neighbor) showItem(neighbor);
        else closeLightbox();
      }
      usePublikLibraryStore.getState().removeItem(token);
      toast.success("Deleted.");
      return true;
    };

    return (
      <>
        <Modal
          resizable={mode === "view"}
          // While an item is dragged out, the window lets the pointer through so
          // the drop reaches the canvas behind it.
          contentInteractive={!galleryModalDraggingUnder.value}
          contentDimmed={
            galleryModalDraggingUnder.value &&
            galleryReopenAfterDragSignal.value
          }
          contentHidden={
            galleryModalDraggingUnder.value &&
            !galleryReopenAfterDragSignal.value
          }
          isOpen={open}
          onClose={closeModal}
          className={twMerge(
            "h-[780px] max-h-[90vh] w-full max-w-5xl",
            mode === "view" &&
              "h-[780px] min-h-[640px] min-w-[66rem] w-[66rem] max-w-none",
          )}
          childPadding={false}
          showClose={false}
          draggable={mode === "view"}
          allowBackgroundInteraction={mode === "view"}
          closeOnOutsideClick={mode !== "view"}
          accessibleTitle="My Library"
        >
          {mode === "view" && (
            <Modal.DragHandle>
              <div className="absolute left-0 top-0 z-[50] h-[60px] w-full cursor-move" />
            </Modal.DragHandle>
          )}
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-ui-panel-border bg-ui-panel p-4 py-3">
              <div className="relative z-[51] flex items-center gap-3">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/80">
                  {mode === "select" ? "Select from your library" : "My Library"}
                </h2>
                {!hideFilter && !lockedFilter && (
                  <div className="flex items-center gap-0.5 rounded-[3px] bg-ui-controls/40 p-0.5">
                    {FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setChosenFilter(f.id)}
                        className={twMerge(
                          "rounded-[3px] px-3 py-1 text-sm font-medium transition-colors",
                          chosenFilter === f.id
                            ? "bg-ui-controls text-base-fg"
                            : "text-base-fg/60 hover:text-base-fg",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative z-[51] flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  aria-label="Refresh the library"
                  title="Refresh the library"
                  className="flex h-8 w-8 items-center justify-center rounded-[3px] text-base-fg/70 transition-colors hover:bg-white/10 hover:text-base-fg"
                >
                  <RefreshCwIcon
                    className={twMerge("h-4 w-4", isLoading && "animate-spin")}
                  />
                </button>
                {mode === "view" && <Modal.ExpandButton />}
                <CloseButton onClick={closeModal} />
              </div>
            </div>

            <div
              className="flex flex-1 flex-col overflow-y-auto"
              data-gallery-modal
            >
              {isInitialLoading && items.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <LoadingSpinner className="h-10 w-10 text-base-fg" />
                </div>
              ) : error && items.length === 0 ? (
                <EmptyState
                  title="Could not open your library."
                  detail={error}
                  action={
                    <Button variant="secondary" onClick={() => void refresh()}>
                      Try again
                    </Button>
                  }
                />
              ) : visibleItems.length === 0 ? (
                <EmptyState
                  title={emptyTitle(filter)}
                  detail={
                    filter === "none"
                      ? "This app makes images and speech only."
                      : "Make an image or a speech clip. It shows here."
                  }
                />
              ) : (
                <div className="space-y-6 p-4">
                  {groups.map((group, groupIndex) => (
                    <section key={`${group.label}-${groupIndex}`}>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-base-fg/50">
                        {group.label}
                      </h3>
                      <div
                        className={twMerge(
                          "grid gap-2",
                          mode === "view" ? "grid-cols-5" : "grid-cols-4",
                        )}
                      >
                        {group.items.map((item) => (
                          <LibraryTile
                            key={item.id}
                            item={item}
                            mode={mode}
                            selected={selectedItemIds.includes(item.id)}
                            selectionNumber={
                              selectedItemIds.indexOf(item.id) + 1
                            }
                            disabled={disabledItemIds.includes(item.id)}
                            onOpen={openLightbox}
                            onSelect={handleTileSelect}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {mode === "select" && (
              <div className="flex items-center justify-between border-t border-ui-panel-border bg-ui-panel p-4">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-base-fg/80">
                    {selectedItemIds.length}/{maxSelections} selected
                  </div>
                  {selectedItemIds.length > 0 && (
                    <>
                      <span className="text-base-fg/10">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="text-sm text-base-fg/60 hover:text-base-fg"
                      >
                        Deselect all
                      </button>
                    </>
                  )}
                </div>
                <Button
                  onClick={handleUseSelected}
                  disabled={selectedItemIds.length === 0 || useSelectedLoading}
                  loading={useSelectedLoading}
                >
                  Use selected
                </Button>
              </div>
            )}
          </div>
        </Modal>

        {mode === "view" && (
          <LightboxModal
            isOpen={galleryModalLightboxVisible.value && !!shown}
            onClose={closeLightbox}
            onCloseGallery={closeGallery}
            imageUrl={shownUrl}
            imageUrls={shown?.imageUrls}
            mediaTokens={shown?.mediaTokens}
            mediaId={shown?.id}
            mediaClass={shown?.mediaClass}
            imageAlt={shown?.prompt || shown?.label || ""}
            prompt={shown?.prompt}
            title={shown?.label}
            modelName={publikModelName(shown?.modelId)}
            createdAt={shown?.createdAt}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onEditClicked={onEditClicked}
            onUseAsReferenceClicked={onUseAsReferenceClicked}
            onReusePromptClicked={
              onReusePromptClicked
                ? (prompt) => onReusePromptClicked(prompt, shown?.modelId)
                : undefined
            }
            onSelectBatchItem={(token) => {
              const item = items.find((entry) => entry.id === token);
              if (item) showItem(item);
            }}
            onNavigatePrev={
              galleryModalLightboxNavPrev.value ??
              (prevItem ? () => showItem(prevItem) : undefined)
            }
            onNavigateNext={
              galleryModalLightboxNavNext.value ??
              (nextItem ? () => showItem(nextItem) : undefined)
            }
          />
        )}
      </>
    );
  },
);

GalleryModal.displayName = "GalleryModal";

// ── Tile ──────────────────────────────────────────────────────────────────────

interface LibraryTileProps {
  item: LocalGalleryItem;
  mode: ModalMode;
  selected: boolean;
  selectionNumber: number;
  disabled: boolean;
  onOpen: (item: LocalGalleryItem) => void;
  onSelect: (item: LocalGalleryItem) => void;
}

const LibraryTile = React.memo(
  ({
    item,
    mode,
    selected,
    selectionNumber,
    disabled,
    onOpen,
    onSelect,
  }: LibraryTileProps) => {
    const [failed, setFailed] = useState(false);
    const isAudio = item.mediaClass === "audio";
    const caption = item.prompt || item.label;

    return (
      <button
        type="button"
        title={caption}
        aria-label={`${isAudio ? "Speech" : "Image"}: ${caption}`}
        aria-pressed={mode === "select" ? selected : undefined}
        disabled={mode === "select" && disabled}
        onClick={() => (mode === "select" ? onSelect(item) : onOpen(item))}
        onPointerDown={(e) => {
          // View mode: drag an image out onto the canvas or the moodboard.
          if (mode === "view" && !isAudio) galleryDnd.onPointerDown(e, item);
        }}
        className={twMerge(
          "group relative aspect-square overflow-hidden border bg-black/30 text-left transition-colors",
          selected
            ? "border-primary ring-2 ring-primary"
            : "border-white/10 hover:border-white/40",
          mode === "select" && disabled && "cursor-not-allowed opacity-40",
        )}
      >
        {isAudio ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-3">
            <MusicIcon className="h-8 w-8 text-base-fg/50" />
            <span className="line-clamp-3 text-center text-xs text-base-fg/80">
              {caption}
            </span>
          </div>
        ) : failed || !item.thumbnail ? (
          <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-base-fg/50">
            This file is not on this computer.
          </div>
        ) : (
          <img
            src={item.thumbnail}
            alt={caption}
            draggable={false}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}

        {!isAudio && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="line-clamp-2 text-xs text-white/90">{caption}</span>
          </div>
        )}

        {mode === "select" && selected && (
          <div className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
            {selectionNumber > 0 ? selectionNumber : <CheckIcon className="h-3.5 w-3.5" />}
          </div>
        )}
        {mode === "select" && disabled && (
          <div className="absolute left-1.5 top-1.5 bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            Added
          </div>
        )}
      </button>
    );
  },
);

LibraryTile.displayName = "LibraryTile";

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-base font-semibold text-base-fg/80">{title}</p>
      {detail && <p className="max-w-sm text-sm text-base-fg/50">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The filter a page forces. "none" when it asks for a kind the app does not make. */
function toLockedFilter(
  forceFilter: string | undefined,
): LibraryFilter | "none" | null {
  if (!forceFilter || forceFilter === "all") return null;
  if (forceFilter === "image") return "image";
  if (forceFilter === "audio") return "audio";
  return "none";
}

function emptyTitle(filter: LibraryFilter | "none"): string {
  switch (filter) {
    case "image":
      return "No images yet.";
    case "audio":
      return "No speech clips yet.";
    case "none":
      return "Nothing to show here.";
    default:
      return "Your library is empty.";
  }
}

/** Items (already newest first) grouped under "Today", "Yesterday" or a date. */
function groupByDay(
  items: LocalGalleryItem[],
): { label: string; items: LocalGalleryItem[] }[] {
  const groups: { label: string; items: LocalGalleryItem[] }[] = [];
  const today = startOfDay(new Date());
  const yesterday = today - 24 * 60 * 60 * 1000;
  for (const item of items) {
    const date = new Date(item.createdAt);
    const day = Number.isNaN(date.getTime()) ? null : startOfDay(date);
    const label =
      day === null
        ? "Earlier"
        : day === today
          ? "Today"
          : day === yesterday
            ? "Yesterday"
            : date.toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** A delete call can resolve with `{ status: "...", error_message }` instead of throwing. */
function throwIfCommandFailed(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "status" in result &&
    (result as { status?: unknown }).status !== "success"
  ) {
    throw result;
  }
}

export default GalleryModal;
