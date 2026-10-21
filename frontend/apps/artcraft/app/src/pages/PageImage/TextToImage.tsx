import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JobContextType } from "@storyteller/common";
import { PromptBoxImage, publikUploadImage } from "@storyteller/ui-promptbox";
import {
  useTextToImagePageModelList,
  ModelPage,
  ClassyModelSelector,
  useSelectedImageModel,
  useSelectedProviderForModel,
} from "@storyteller/ui-model-selector";
import { ImageModel } from "@storyteller/model-list";
import { useTextToImageStore } from "./TextToImageStore";
import {
  galleryModalLightboxImage,
  galleryModalLightboxMediaId,
  galleryModalLightboxVisible,
  galleryModalLightboxNavPrev,
  galleryModalLightboxNavNext,
} from "@storyteller/ui-gallery-modal";
import { GenerationProvider } from "@storyteller/api-enums";
import {
  useLastViewedGenerationStore,
  type GalleryItem,
} from "@storyteller/ui-generation-list";
import { useDesktopGenerationFeed } from "~/components/generation-feed/useDesktopGenerationFeed";
import { DesktopCreatePageShell } from "~/components/generation-feed/DesktopCreatePageShell";
import { DesktopGenerationGallery } from "~/components/generation-feed/DesktopGenerationGallery";

const PAGE_ID: ModelPage = ModelPage.TextToImage;

const NO_MORE_PAGES = () => {};

interface TextToImageProps {
  imageMediaId?: string;
  imageUrl?: string;
}

const TextToImage = ({ imageMediaId, imageUrl }: TextToImageProps) => {
  const textToImageModelList = useTextToImagePageModelList();
  const startBatch = useTextToImageStore((s) => s.startBatch);
  const promptContentRef = useRef<HTMLDivElement>(null);
  const [promptHeight, setPromptHeight] = useState<number>(138);

  const selectedImageModel: ImageModel | undefined =
    useSelectedImageModel(PAGE_ID);

  const selectedProvider: GenerationProvider | undefined =
    useSelectedProviderForModel(PAGE_ID, selectedImageModel?.id);

  const jobContext: JobContextType = {
    jobTokens: [],
    addJobToken: () => {},
    removeJobToken: () => {},
    clearJobTokens: () => {},
  };

  // Track the promptbox height so the feed can pad past it.
  useEffect(() => {
    const el = promptContentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setPromptHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The feed: in progress and failed from the local task queue, finished
  // images from the "image complete" event, history from the local library.
  const feed = useDesktopGenerationFeed({ mediaType: "image" });

  // Content only: while the library loads, the shell keeps the hero and the
  // background up, and fades them out when items show.
  const hasContent =
    feed.inProgress.length > 0 ||
    feed.failed.length > 0 ||
    feed.newlyCompleted.length > 0 ||
    feed.history.length > 0;

  const newlyCompletedTokens = useMemo(
    () => new Set(feed.newlyCompleted.map((item) => item.id)),
    [feed.newlyCompleted],
  );

  // Flat, time-sorted completed list driving lightbox prev/next navigation.
  const flatCompleted = useMemo(() => {
    const seen = new Set<string>();
    const merged: GalleryItem[] = [];
    for (const item of feed.newlyCompleted) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    for (const item of feed.history) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    merged.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return merged;
  }, [feed.newlyCompleted, feed.history]);

  const flatCompletedRef = useRef(flatCompleted);
  flatCompletedRef.current = flatCompleted;

  // Open a finished item in the lightbox (the top bar's library renders it).
  // Previous and next walk the feed order.
  const lastViewedId = useLastViewedGenerationStore((s) => s.id);

  const openInLightbox = useCallback((item: GalleryItem) => {
    useLastViewedGenerationStore.getState().setId(item.id);
    const list = flatCompletedRef.current;
    const index = list.findIndex((i) => i.id === item.id);
    galleryModalLightboxNavPrev.value =
      index > 0 ? () => openInLightbox(list[index - 1]) : null;
    galleryModalLightboxNavNext.value =
      index >= 0 && index < list.length - 1
        ? () => openInLightbox(list[index + 1])
        : null;
    galleryModalLightboxMediaId.value = item.id;
    // The library fills in the batch, the prompt and the model by id; these
    // fields cover an item that the library does not list yet.
    galleryModalLightboxImage.value = {
      id: item.id,
      label: item.label,
      thumbnail: item.thumbnail,
      fullImage: item.fullImage,
      createdAt: item.createdAt,
      mediaClass: item.mediaClass,
      modelId: item.modelId,
      prompt: item.prompt,
      batchImageToken: item.batchImageToken,
      mediaTokens: (item as { mediaTokens?: string[] }).mediaTokens,
      imageUrls: (item as { imageUrls?: string[] }).imageUrls,
    };
    galleryModalLightboxVisible.value = true;
  }, []);

  return (
    <DesktopCreatePageShell
      hasContent={hasContent}
      emptyStateTitle="Create Image"
      emptyStateSubtitle={
        feed.historyError ?? "Write a prompt to make an image."
      }
      bottomOffset={promptHeight + 40}
      listContent={
        <DesktopGenerationGallery
          inProgressJobs={feed.inProgress}
          failedJobs={feed.failed}
          onDismissFailed={feed.dismissFailed}
          newlyCompletedItems={feed.newlyCompleted}
          galleryItems={feed.history}
          newlyCompletedTokens={newlyCompletedTokens}
          hasMore={false}
          isInitialLoading={feed.isHistoryLoading}
          onLoadMore={NO_MORE_PAGES}
          onGalleryItemClick={openInLightbox}
          lastViewedId={lastViewedId}
          selectable
          selectionBarBottomOffset={promptHeight + 32}
        />
      }
      promptBox={
        <div className="fixed bottom-4 left-1/2 z-20 w-full max-w-5xl -translate-x-1/2 px-2 sm:px-4">
          <div ref={promptContentRef}>
            <PromptBoxImage
              useJobContext={() => {
                return jobContext;
              }}
              uploadImage={publikUploadImage}
              selectedModel={selectedImageModel}
              selectedProvider={selectedProvider}
              imageMediaId={imageMediaId}
              url={imageUrl ?? undefined}
              modelSelector={
                <ClassyModelSelector
                  variant="embedded"
                  items={textToImageModelList}
                  page={PAGE_ID}
                />
              }
              onEnqueuePressed={async (prompt, count, subscriberId) => {
                const modelLabel = selectedImageModel?.fullName ?? "";
                startBatch(
                  prompt,
                  count,
                  modelLabel,
                  subscriberId,
                  selectedImageModel?.creator,
                );
                // Tell the feed (and the top bar task queue) to load again, so
                // the pending row shows at once.
                window.dispatchEvent(new Event("task-queue-update"));
              }}
            />
          </div>
        </div>
      }
    />
  );
};

export default TextToImage;
