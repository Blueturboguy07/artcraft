// Top-level shell for the app. Always-mounted chrome (TopBar, the publik setup card,
// toaster, Tauri event listeners) lives here, and a single tab-driven switch picks the
// active page below it.
//
// publik's build: the only AI provider is publik API (or the person's own key), set up
// through the publik setup card. There is no account, no sign-in screen, no credits and no
// telemetry. Features that publik API cannot serve (video, 3D, VFX, background tools,
// angles, watermark removers, the 3D stage, the frame extractor) have no route here.

import { lazy, Suspense, useEffect } from "react";
import { useSignals } from "@preact/signals-react/runtime";

import { TopBar } from "~/components/signaled/TopBar/TopBar";
import { PublikSetupModal } from "@storyteller/provider-setup-modal";
import { toast, Toaster } from "@storyteller/ui-toaster";
import { commandErrorMessage } from "@storyteller/tauri-api";
import {
  GalleryDragComponent,
  GalleryItem,
  onImageDrop,
  removeImageDropListener,
} from "@storyteller/ui-gallery-modal";
import {
  isActionReminderOpen,
  actionReminderProps,
  ActionReminderModal,
} from "@storyteller/ui-action-reminder-modal";
import {
  useFlashFileDownloadErrorEvent,
  useFlashUserInputErrorEvent,
  useGenerationCompleteEvent,
  useGenerationEnqueueFailureEvent,
  useGenerationEnqueueSuccessEvent,
  useGenerationFailedEvent,
  useMediaFileDeletedEvent,
  useTextToImageGenerationCompleteEvent,
} from "@storyteller/tauri-events";
import { SoundManager } from "@storyteller/soundboard";
import { useStoryboardPageEnabled } from "@storyteller/ui-settings-modal";

import { useTabStore } from "./Stores/TabState";
import { useTextToImageStore } from "./PageImage/TextToImageStore";

import { AppsIndexPage } from "./PageApps/AppsIndexPage";
import PageDraw from "./PageDraw/PageDraw";
import {
  topNavMediaId,
  topNavMediaUrl,
} from "~/components/signaled/TopBar/TopBar";

// Load editors when selected, keeping their code off the launch path. Drawing
// stays eager: its shared store/UI is already needed by the shell, so deferring
// its small host adapter adds first-open latency for very little byte saving.
// Declare lazy components once so navigating does not recreate their identity.
const TextToImage = lazy(() => import("./PageImage/TextToImage"));
const CreateAudio = lazy(() => import("./PageAudio/CreateAudio"));
const Storyboard = lazy(() =>
  import("./PageStoryboard").then((m) => ({ default: m.Storyboard })),
);
const PageMoodboard = lazy(() =>
  import("./PageMoodboard").then((m) => ({ default: m.PageMoodboard })),
);

export const MainApp = () => {
  useSignals();

  // Tauri event listeners. Must always be mounted so generation completions
  // are surfaced no matter which tab the user is on.
  useGenerationEnqueueSuccessEvent();
  useGenerationEnqueueFailureEvent();
  useGenerationCompleteEvent();
  useGenerationFailedEvent();

  const completeBatch = useTextToImageStore((s) => s.completeBatch);
  useTextToImageGenerationCompleteEvent(async (event) => {
    completeBatch(
      event.generated_images || [],
      event.maybe_frontend_subscriber_id,
    );
  });

  useFlashUserInputErrorEvent(async (event) => {
    toast.error(
      commandErrorMessage(event.message, "Check your input and try again."),
    );
  });

  useFlashFileDownloadErrorEvent(async (event) => {
    toast.error(
      commandErrorMessage(event.message, "Could not save the file. Try again."),
    );
  });

  useMediaFileDeletedEvent(async () => {
    await SoundManager.playFileDeleted();
    toast.success("File deleted.");
  });

  const currentReminderModalProps = actionReminderProps.value;

  return (
    <div className="w-screen">
      <TopBar pageName="Edit Scene" />
      {/* publik API's setup card: the onboarding. It opens once on the first launch. */}
      <PublikSetupModal />

      <Suspense
        fallback={
          <div
            role="status"
            className="flex h-[calc(100vh-56px)] items-center justify-center text-base-fg/60"
          >
            Loading…
          </div>
        }
      >
        <TabBody />
      </Suspense>

      <GalleryDragComponent />
      <Toaster offsetTop={70} offsetRight={12} zIndex={9999} />
      {currentReminderModalProps && (
        <ActionReminderModal
          isOpen={isActionReminderOpen.value}
          onClose={currentReminderModalProps.onClose}
          reminderType={currentReminderModalProps.reminderType}
          onPrimaryAction={currentReminderModalProps.onPrimaryAction}
          title={currentReminderModalProps.title}
          message={currentReminderModalProps.message}
          primaryActionText={currentReminderModalProps.primaryActionText}
          secondaryActionText={currentReminderModalProps.secondaryActionText}
          onSecondaryAction={currentReminderModalProps.onSecondaryAction}
          isLoading={currentReminderModalProps.isLoading}
          openAiLogo={currentReminderModalProps.openAiLogo}
          primaryActionIcon={currentReminderModalProps.primaryActionIcon}
          primaryActionBtnClassName={
            currentReminderModalProps.primaryActionBtnClassName
          }
        />
      )}
    </div>
  );
};

const TabBody = () => {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const storyboardPageEnabled = useStoryboardPageEnabled();

  // Every page is a fragment whose top-level children may use position: fixed
  // (e.g. PageDraw); the wrapping <div> scopes them so they don't stack as
  // siblings of the TopBar at the MainApp root.
  switch (activeTabId) {
    case "APPS":
      return (
        <div>
          <AppsIndexPage />
        </div>
      );
    case "2D":
      return (
        <div>
          <PageDrawWithGalleryDrop />
        </div>
      );
    case "IMAGE":
      return (
        <div>
          <TextToImage
            imageMediaId={topNavMediaId.value}
            imageUrl={topNavMediaUrl.value}
          />
        </div>
      );
    case "AUDIO":
      return (
        <div>
          <CreateAudio />
        </div>
      );
    case "STORYBOARD":
      return storyboardPageEnabled ? (
        <div>
          <Storyboard />
        </div>
      ) : null;
    case "MOODBOARD":
      // The TopBar is fixed and 56px tall, so the board sits below it and fills
      // the rest of the viewport. h-screen + pt-[56px] (border-box) makes the
      // board area exactly viewport-minus-topbar, and overflow-hidden keeps
      // sub-pixel 100vh rounding from spawning page scrollbars (which w-screen
      // ancestors would turn into a horizontal scrollbar via the Windows
      // scrollbar gutter).
      return (
        <div className="h-[calc(100vh-56px)] w-full overflow-hidden">
          <PageMoodboard />
        </div>
      );
    default:
      return null;
  }
};

// Bridges gallery-modal's onImageDrop into PageDraw's existing
// `gallery-2d-drop` window-event listener. Lives here (rather than
// inside the pagedraw lib) so we don't have to add a gallery-modal
// dep there. Mounted only when the 2D tab is active.
const PageDrawWithGalleryDrop = () => {
  useEffect(() => {
    const handler = onImageDrop(
      (item: GalleryItem, position: { x: number; y: number }) => {
        const canvasElement = document.querySelectorAll("canvas")[0];
        if (!canvasElement) return;
        const rect = canvasElement.getBoundingClientRect();
        const canvasX = position.x - rect.left;
        const canvasY = position.y - rect.top;
        if (
          canvasX < 0 ||
          canvasY < 0 ||
          canvasX > rect.width ||
          canvasY > rect.height
        ) {
          return;
        }
        window.dispatchEvent(
          new CustomEvent("gallery-2d-drop", {
            detail: { item, canvasPosition: { x: canvasX, y: canvasY } },
          }),
        );
      },
    );
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (handler) removeImageDropListener(handler as any);
    };
  }, []);
  return <PageDraw />;
};
