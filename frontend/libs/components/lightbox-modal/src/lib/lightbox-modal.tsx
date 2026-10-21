import { Modal } from "@storyteller/ui-modal";
import { Tooltip } from "@storyteller/ui-tooltip";
import { Button } from "@storyteller/ui-button";
import dayjs from "dayjs";
import {
  ArrowDownToLineIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ImagePlusIcon,
  InfoIcon,
  MusicIcon,
  PencilIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";
import { LoadingSpinner } from "@storyteller/ui-loading-spinner";
import { toast } from "@storyteller/ui-toaster";
import { twMerge } from "tailwind-merge";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// The lightbox for one stored result: the image (and every image of its batch)
// or the speech clip, its prompt, model and date, and the actions on it. All
// data is local; the host (GalleryModal) passes the callbacks that call Rust.

export interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Also close the library around the lightbox (after "Edit", "Use as reference"). */
  onCloseGallery?: () => void;
  /** The selected item's URL (asset://). Used when there is no batch. */
  imageUrl?: string | null;
  /** Every image URL of the batch, in order. */
  imageUrls?: string[];
  /** Every token of the batch, same order as imageUrls. */
  mediaTokens?: string[];
  /** Index of the selected image in the batch. */
  initialIndex?: number;
  /** The selected item's local token. */
  mediaId?: string;
  /** "image" or "audio". */
  mediaClass?: string;
  imageAlt?: string;
  /** The prompt of the request. */
  prompt?: string;
  /** Fallback text when there is no prompt. */
  title?: string;
  /** The model, as a display name (e.g. "GPT Image 1"). */
  modelName?: string;
  createdAt?: string;
  onImageError?: () => void;
  onDownload?: (token: string) => Promise<void> | void;
  /** Delete the file. Return true when it is gone. */
  onDelete?: (token: string) => Promise<boolean> | boolean;
  onEditClicked?: (url: string, media_id?: string) => Promise<void> | void;
  onUseAsReferenceClicked?: (
    url: string,
    media_id?: string,
  ) => Promise<void> | void;
  /** Put the prompt back into the prompt box. */
  onReusePromptClicked?: (prompt: string) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  /** Called when the person picks another image of the batch. */
  onSelectBatchItem?: (token: string, url: string) => void;
  additionalInfo?: ReactNode;
}

export function LightboxModal({
  isOpen,
  onClose,
  onCloseGallery,
  imageUrl,
  imageUrls,
  mediaTokens,
  initialIndex,
  mediaId,
  mediaClass,
  imageAlt = "",
  prompt,
  title,
  modelName,
  createdAt,
  onImageError,
  onDownload,
  onDelete,
  onEditClicked,
  onUseAsReferenceClicked,
  onReusePromptClicked,
  onNavigatePrev,
  onNavigateNext,
  onSelectBatchItem,
  additionalInfo,
}: LightboxModalProps) {
  const isAudio = mediaClass === "audio";

  // The batch shown as thumbnails. A single item is a batch of one.
  const batch = useMemo(() => {
    const urls = imageUrls && imageUrls.length > 0 ? imageUrls : [];
    const tokens = mediaTokens && mediaTokens.length > 0 ? mediaTokens : [];
    if (!isAudio && urls.length > 0 && urls.length === tokens.length) {
      return urls.map((url, i) => ({ url, token: tokens[i] }));
    }
    return imageUrl ? [{ url: imageUrl, token: mediaId ?? "" }] : [];
  }, [imageUrls, mediaTokens, imageUrl, mediaId, isAudio]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    const byToken = mediaId
      ? batch.findIndex((entry) => entry.token === mediaId)
      : -1;
    const index =
      byToken >= 0
        ? byToken
        : Math.min(Math.max(initialIndex ?? 0, 0), Math.max(batch.length - 1, 0));
    setSelectedIndex(index);
  }, [batch, mediaId, initialIndex]);

  const selected = batch[selectedIndex];
  const selectedUrl = selected?.url ?? null;
  const selectedToken = selected?.token || mediaId || "";

  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  useEffect(() => {
    setMediaLoaded(false);
    setSize(null);
  }, [selectedUrl]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedToken, isOpen]);

  useEffect(
    () => () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const promptText = (prompt ?? "").trim() || (title ?? "").trim();

  const selectBatchItem = useCallback(
    (index: number) => {
      const entry = batch[index];
      if (!entry) return;
      setSelectedIndex(index);
      onSelectBatchItem?.(entry.token, entry.url);
    },
    [batch, onSelectBatchItem],
  );

  // Arrow keys move through the library (or the batch when there is no list).
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        if (onNavigatePrev) onNavigatePrev();
        else if (selectedIndex > 0) selectBatchItem(selectedIndex - 1);
      } else if (e.key === "ArrowRight") {
        if (onNavigateNext) onNavigateNext();
        else if (selectedIndex < batch.length - 1)
          selectBatchItem(selectedIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    onNavigatePrev,
    onNavigateNext,
    selectedIndex,
    batch.length,
    selectBatchItem,
  ]);

  const handleCopyPrompt = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setPromptCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(
        () => setPromptCopied(false),
        1500,
      );
    } catch {
      toast.error("Could not copy the prompt.");
    }
  };

  const handleDownload = async () => {
    if (!onDownload || !selectedToken || isDownloading) return;
    setIsDownloading(true);
    try {
      await onDownload(selectedToken);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !selectedToken || isDeleting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(selectedToken);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const hasActions =
    !!selectedUrl &&
    (!!onDownload ||
      !!onDelete ||
      (!isAudio && (!!onEditClicked || !!onUseAsReferenceClicked)) ||
      (!!onReusePromptClicked && !!promptText));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="rounded-none border-white/15 bg-ui-modal h-[760px] w-[1200px] max-w-screen min-w-[1000px] min-h-[600px] p-4"
      draggable
      allowBackgroundInteraction={true}
      showClose={true}
      closeOnOutsideClick={false}
      resizable={true}
      backdropClassName="pointer-events-none hidden"
      expandable={true}
      accessibleTitle={isAudio ? "Speech" : "Image"}
    >
      <Modal.DragHandle>
        <div className="absolute left-0 top-0 z-20 h-12 w-full cursor-move" />
      </Modal.DragHandle>

      <div className="flex h-full gap-4">
        {/* Media panel */}
        <div className="group/nav relative flex h-full flex-1 flex-col overflow-hidden bg-black">
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {!selectedUrl ? (
              <span className="text-base-fg/60">
                This file is not on this computer.
              </span>
            ) : isAudio ? (
              <div className="flex w-full max-w-xl flex-col items-center gap-6 px-8">
                <div className="flex h-24 w-24 items-center justify-center border border-white/15 bg-white/5">
                  <MusicIcon className="h-10 w-10 text-white/60" />
                </div>
                <audio
                  key={selectedUrl}
                  controls
                  src={selectedUrl}
                  className="w-full"
                  onLoadedData={() => setMediaLoaded(true)}
                />
              </div>
            ) : (
              <img
                key={selectedUrl}
                src={selectedUrl}
                alt={imageAlt || promptText || "Image"}
                className="h-full w-full object-contain"
                onLoad={(e) => {
                  setMediaLoaded(true);
                  setSize({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  });
                }}
                onError={(e) => {
                  setMediaLoaded(true);
                  e.currentTarget.style.opacity = "0.3";
                  onImageError?.();
                }}
              />
            )}

            {!mediaLoaded && selectedUrl && !isAudio && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <LoadingSpinner className="h-12 w-12 text-base-fg" />
              </div>
            )}

            {onNavigatePrev && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigatePrev();
                }}
                className="absolute left-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-black/50 text-white/70 opacity-0 transition-opacity duration-200 hover:bg-black/70 hover:text-white focus:outline-none group-hover/nav:opacity-100"
                aria-label="Previous item"
              >
                <ChevronLeftIcon className="text-lg" />
              </button>
            )}
            {onNavigateNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateNext();
                }}
                className="absolute right-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-black/50 text-white/70 opacity-0 transition-opacity duration-200 hover:bg-black/70 hover:text-white focus:outline-none group-hover/nav:opacity-100"
                aria-label="Next item"
              >
                <ChevronRightIcon className="text-lg" />
              </button>
            )}
          </div>

          {batch.length > 1 && (
            <div className="flex justify-center gap-2 px-2 py-2">
              {batch.map((entry, idx) => (
                <button
                  key={`${entry.token}-${idx}`}
                  type="button"
                  onClick={() => selectBatchItem(idx)}
                  aria-label={`Image ${idx + 1} of ${batch.length}`}
                  className={twMerge(
                    "relative h-16 w-16 shrink-0 overflow-hidden border transition-all",
                    idx === selectedIndex
                      ? "border-white opacity-100"
                      : "border-transparent opacity-60 hover:border-white/40 hover:opacity-100",
                  )}
                >
                  <img
                    src={entry.url}
                    alt={`Image ${idx + 1}`}
                    className="h-full w-full bg-black/20 object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info + actions */}
        <div className="flex h-full w-[280px] shrink-0 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2 pr-8 text-base-fg">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/60">
                  {isAudio ? "Text" : "Prompt"}
                </span>
                {promptText && (
                  <Tooltip
                    content={promptCopied ? "Copied" : "Copy prompt"}
                    position="top"
                  >
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      aria-label="Copy prompt"
                      className="flex h-7 w-7 items-center justify-center text-base-fg/60 transition-colors hover:bg-white/10 hover:text-base-fg"
                    >
                      {promptCopied ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : (
                        <CopyIcon className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </Tooltip>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-relaxed text-base-fg/90">
                {promptText || "No prompt."}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/60">
                <InfoIcon className="h-3.5 w-3.5" />
                <span>Information</span>
              </div>
              <div className="flex flex-col overflow-hidden border border-white/10 bg-black/20">
                {modelName && <InfoRow label="Model" value={modelName} />}
                {size && (
                  <InfoRow label="Size" value={`${size.width} × ${size.height}`} />
                )}
                {batch.length > 1 && (
                  <InfoRow
                    label="Image"
                    value={`${selectedIndex + 1} of ${batch.length}`}
                  />
                )}
                {createdAt && (
                  <InfoRow
                    label="Created"
                    value={dayjs(createdAt).format("MMM D, YYYY h:mm A")}
                  />
                )}
              </div>
            </div>

            {additionalInfo}
          </div>

          {hasActions && (
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
              {onReusePromptClicked && promptText && !isAudio && (
                <Button
                  className="col-span-2 w-full py-1.5 text-[13px]"
                  variant="primary"
                  icon={RotateCwIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReusePromptClicked(promptText);
                    onCloseGallery?.();
                  }}
                >
                  Use this prompt
                </Button>
              )}
              {onEditClicked && !isAudio && selectedUrl && (
                <Button
                  className="w-full py-1.5 text-[13px]"
                  variant="primary"
                  icon={PencilIcon}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await onEditClicked(selectedUrl, selectedToken);
                  }}
                >
                  Edit Image
                </Button>
              )}
              {onUseAsReferenceClicked && !isAudio && selectedUrl && (
                <Button
                  className="w-full py-1.5 text-[13px]"
                  variant="secondary"
                  icon={ImagePlusIcon}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await onUseAsReferenceClicked(selectedUrl, selectedToken);
                    onCloseGallery?.();
                  }}
                >
                  Use as reference
                </Button>
              )}
              {onDownload && (
                <Button
                  className="w-full py-1.5 text-[13px]"
                  variant="secondary"
                  icon={ArrowDownToLineIcon}
                  loading={isDownloading}
                  disabled={isDownloading}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDownload();
                  }}
                >
                  Download
                </Button>
              )}
              {onDelete && (
                <Button
                  className="w-full py-1.5 text-[13px]"
                  variant={confirmDelete ? "destructive" : "secondary"}
                  icon={Trash2Icon}
                  loading={isDeleting}
                  disabled={isDeleting}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete();
                  }}
                >
                  {confirmDelete ? "Click to delete" : "Delete"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 px-3 py-2.5 last:border-0">
      <span className="shrink-0 pt-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/60">
        {label}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-2 text-right text-sm font-medium text-base-fg">
        {value}
      </span>
    </div>
  );
}

export default LightboxModal;
