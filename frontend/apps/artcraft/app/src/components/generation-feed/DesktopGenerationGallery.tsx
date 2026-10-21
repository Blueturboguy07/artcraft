import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLineIcon, LoaderCircleIcon, RotateCwIcon } from "lucide-react";
import { DynamicIcon } from "@storyteller/icons";
import { Tooltip } from "@storyteller/ui-tooltip";
import { toast } from "@storyteller/ui-toaster";
import {
  GenerationListView,
  GenerationGridView,
  SelectionActionBar,
  useGallerySelectionStore,
  useGalleryViewStore,
  type FailedJob,
  type GalleryItem,
  type InProgressJob,
} from "@storyteller/ui-generation-list";
import {
  applyRecreateFromPrompt,
  downloadMediaFileToDisk,
  downloadMediaFilesToFolder,
} from "./desktopMediaActions";

// The feed of a create page, in the layout the top bar toggle picked (grid by
// default), with the quick actions ("Use this prompt", "Download") on each
// finished item.

export interface DesktopGenerationGalleryProps {
  inProgressJobs: InProgressJob[];
  failedJobs: FailedJob[];
  onDismissFailed: (jobToken: string) => void;
  newlyCompletedItems: GalleryItem[];
  galleryItems: GalleryItem[];
  newlyCompletedTokens: Set<string>;
  hasMore: boolean;
  isLoading?: boolean;
  isInitialLoading: boolean;
  onLoadMore: () => void;
  onGalleryItemClick: (item: GalleryItem) => void;
  /** Id of the item most recently viewed in the lightbox; that tile gets a
   *  persistent "Last viewed" badge. */
  lastViewedId?: string | null;
  /** @deprecated No video. Accepted and ignored. */
  enableMakeVideo?: boolean;
  /** Enables the multi-select + batch download flow (select toggle in the
   *  TopBar, checkboxes on completed items, floating download bar). */
  selectable?: boolean;
  /** Pixel offset that keeps the floating download bar above the page's
   *  fixed prompt box (pass the measured promptbox height + gap). */
  selectionBarBottomOffset?: number;
}

export function DesktopGenerationGallery({
  enableMakeVideo: _enableMakeVideo,
  selectable,
  selectionBarBottomOffset,
  ...feedProps
}: DesktopGenerationGalleryProps) {
  const viewMode = useGalleryViewStore((s) => s.viewMode);
  const selectionActive = useGallerySelectionStore((s) => s.active);
  const selectedIds = useGallerySelectionStore((s) => s.ids);

  // The selection store is global (like the view-mode store) — drop select
  // mode when the page unmounts (tab switch) so it can't leak elsewhere.
  useEffect(() => {
    if (!selectable) return;
    return () => useGallerySelectionStore.getState().setActive(false);
  }, [selectable]);

  const handleCopyResult = useCallback((success: boolean) => {
    if (success) {
      toast.success("Prompt copied.");
    } else {
      toast.error("Could not copy the prompt.");
    }
  }, []);

  const selectionProps = {
    selectionMode: !!selectable && selectionActive,
    selectedIds,
    onToggleSelect: handleToggleSelect,
  };
  const selectionBar = selectable && (
    <SelectionDownloadBar
      newlyCompletedItems={feedProps.newlyCompletedItems}
      galleryItems={feedProps.galleryItems}
      bottomOffset={selectionBarBottomOffset}
    />
  );

  if (viewMode === "list") {
    return (
      <>
        <GenerationListView
          {...feedProps}
          {...selectionProps}
          renderGalleryActions={(item) => (
            <ItemActions item={item} variant="row" />
          )}
          onCopyPromptResult={handleCopyResult}
        />
        {selectionBar}
      </>
    );
  }

  return (
    <div className="px-3">
      <GenerationGridView
        {...feedProps}
        {...selectionProps}
        renderGalleryActions={(item) => (
          <ItemActions item={item} variant="card" />
        )}
      />
      {selectionBar}
    </div>
  );
}

function handleToggleSelect(item: GalleryItem) {
  useGallerySelectionStore.getState().toggle(item.id);
}

// Floating bar in select mode: "Download" saves each selected item to the
// downloads folder as its own file. It sits above the floating prompt box.
function SelectionDownloadBar({
  newlyCompletedItems,
  galleryItems,
  bottomOffset,
}: {
  newlyCompletedItems: GalleryItem[];
  galleryItems: GalleryItem[];
  bottomOffset?: number;
}) {
  const ids = useGallerySelectionStore((s) => s.ids);
  const [isDownloading, setIsDownloading] = useState(false);

  const selectedItems = useMemo(() => {
    const byId = new Map(
      [...newlyCompletedItems, ...galleryItems].map(
        (it) => [it.id, it] as const,
      ),
    );
    return Array.from(ids)
      .map((id) => byId.get(id))
      .filter((it): it is GalleryItem => !!it);
  }, [newlyCompletedItems, galleryItems, ids]);

  const handleDownload = useCallback(async () => {
    if (isDownloading || selectedItems.length === 0) return;
    setIsDownloading(true);
    try {
      const anySaved = await downloadMediaFilesToFolder(selectedItems);
      if (anySaved) useGallerySelectionStore.getState().setActive(false);
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, selectedItems]);

  return (
    // Sit above the fixed promptbox whatever its measured height is.
    <SelectionActionBar
      className={bottomOffset != null ? "" : "bottom-24"}
      style={bottomOffset != null ? { bottom: bottomOffset } : undefined}
    >
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading || selectedItems.length === 0}
        className="flex items-center gap-2 border border-white/15 bg-ui-controls/60 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-ui-controls/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
      >
        <DynamicIcon
          icon={isDownloading ? LoaderCircleIcon : ArrowDownToLineIcon}
          className={`text-xs ${isDownloading ? "animate-spin" : ""}`}
        />
        Download
      </button>
    </SelectionActionBar>
  );
}

// Quick actions for a finished item. "Use this prompt" puts the prompt (and
// the model) back into the image prompt box; "Download" saves the local file
// to the downloads folder. stopPropagation keeps a click from also opening the
// lightbox.
function ItemActions({
  item,
  variant,
}: {
  item: GalleryItem;
  variant: "row" | "card";
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  const prompt = item.prompt?.trim() ?? "";
  const canRecreate = !!prompt && item.mediaClass === "image";

  const buttonClass =
    variant === "card"
      ? "flex h-7 w-7 items-center justify-center text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-60"
      : "flex h-8 w-8 items-center justify-center text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60";

  const handleRecreate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!prompt) return;
      applyRecreateFromPrompt(prompt, item.modelId);
    },
    [prompt, item.modelId],
  );

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isDownloading) return;
      setIsDownloading(true);
      try {
        await downloadMediaFileToDisk(item.id, item.mediaClass);
      } finally {
        setIsDownloading(false);
      }
    },
    [item.id, item.mediaClass, isDownloading],
  );

  return (
    <>
      {canRecreate && (
        <Tooltip content="Use this prompt" position="top">
          <button
            type="button"
            onClick={handleRecreate}
            aria-label="Use this prompt"
            className={buttonClass}
          >
            <RotateCwIcon className="text-sm" />
          </button>
        </Tooltip>
      )}
      <Tooltip content="Download" position="top">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          aria-label="Download"
          className={buttonClass}
        >
          <DynamicIcon
            icon={isDownloading ? LoaderCircleIcon : ArrowDownToLineIcon}
            className={`text-sm ${isDownloading ? "animate-spin" : ""}`}
          />
        </button>
      </Tooltip>
    </>
  );
}
