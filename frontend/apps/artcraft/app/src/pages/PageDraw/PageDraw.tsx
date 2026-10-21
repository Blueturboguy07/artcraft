import { useMemo } from "react";
import {
  PageDraw as PageDrawLib,
  useSceneStore,
  type PageDrawAdapter,
  type BaseSelectorImage,
  type ImageBundle,
} from "@storyteller/ui-pagedraw";
import {
  GenerateImage,
  GenerateImageRequest,
  PublikImportImage,
  commandErrorMessage,
} from "@storyteller/tauri-api";
import { GenerationProvider } from "@storyteller/api-enums";
import { CommonAspectRatio } from "@storyteller/model-list";
import { useTextToImageGenerationCompleteEvent } from "@storyteller/tauri-events";
import { publikUploadImage } from "@storyteller/ui-promptbox";
import { usePublikStore } from "@storyteller/provider-setup-modal";
import { toast } from "@storyteller/ui-toaster";
import { BaseImageSelector } from "./BaseImageSelector";

// publik's build: every edit goes to publik API (or the person's own key). The composite
// canvas is stored on this computer first, and its local token is the one image the model
// edits. publik API takes no painted mask and has no background tool.

const EDIT_FALLBACK = "Could not start the edit. Check your prompt and try again.";
const CANVAS_FALLBACK = "Could not read the canvas. Try again.";

// ─── Aspect ratio mapper ──────────────────────────────────────────────────────
const mapAspectRatio = (ratio?: string): CommonAspectRatio | undefined => {
  switch (ratio) {
    case "auto":   return CommonAspectRatio.Auto;
    case "wide":   return CommonAspectRatio.Wide;
    case "tall":   return CommonAspectRatio.Tall;
    case "square": return CommonAspectRatio.Square;
    default:       return undefined;
  }
};

/** One plain sentence for the person; the setup card opens when publik API is not set up. */
const showCommandError = (err: unknown, fallback: string) => {
  toast.error(commandErrorMessage(err, fallback));
  const errorType = (err as { error_type?: string } | undefined)?.error_type;
  if (errorType === "needs_publik_setup") {
    usePublikStore.getState().openSetup("pick");
  }
};

// ─── Tauri event bridges ───────────────────────────────────────────────────────
// These hooks wire Tauri backend events into the shared Zustand store.
// They live here so the lib itself has no Tauri imports.
const useTauriEventBridges = () => {
  // The unified `generate_image` Tauri command emits
  // `text_to_image_generation_complete_event` for every image request. We filter on
  // `frontend_subscriber_id` so PageDraw only resolves placeholders it enqueued itself.
  useTextToImageGenerationCompleteEvent(async (event) => {
    const store = useSceneStore.getState();
    if (store.pendingGenerations.length === 0) return;

    const subscriberId = event.maybe_frontend_subscriber_id;
    if (
      subscriberId &&
      !store.pendingGenerations.some((p) => p.id === subscriberId)
    ) {
      return;
    }

    const resolvedId = subscriberId ?? store.pendingGenerations[0]?.id;

    const newBundle: ImageBundle = {
      images: event.generated_images.map(
        (img) =>
          ({
            url: img.cdn_url,
            mediaToken: img.media_token,
            thumbnailUrlTemplate: img.maybe_thumbnail_template,
            fullImageUrl: img.cdn_url,
          }) as BaseSelectorImage,
      ),
    };

    store.addHistoryImageBundle(newBundle);
    if (resolvedId) store.resolvePendingGeneration(resolvedId);
  });
};

// ─── TauriPageDrawAdapter ──────────────────────────────────────────────────────
const useTauriAdapter = (): PageDrawAdapter => {
  return useMemo<PageDrawAdapter>(
    () => ({
      enqueueEditImage: async (req) => {
        const references = req.imageMediaTokens?.filter((t) => t.length > 0);
        const request: GenerateImageRequest = {
          provider: GenerationProvider.Publik,
          model: req.model,
          canvas_image_media_token: req.canvasImageMediaToken,
          image_media_tokens: references?.length ? references : undefined,
          prompt: req.prompt,
          batch_size: req.imageCount,
          // Nano Banana makes square images only.
          aspect_ratio:
            req.model?.canChangeAspectRatio === false
              ? CommonAspectRatio.Square
              : mapAspectRatio(req.aspectRatio),
          frontend_caller: req.frontendCaller,
          frontend_subscriber_id: req.frontendSubscriberId,
        };
        try {
          return await GenerateImage(request);
        } catch (err) {
          showCommandError(err, EDIT_FALLBACK);
          return { status: "error" };
        }
      },

      // publik API takes no painted mask. The models on this page edit the whole canvas,
      // so the page does not call this.
      enqueueInpaint: async () => {
        toast.error(
          "publik API does not take a painted mask. Describe the change in the prompt.",
        );
        return { status: "error" };
      },

      importImage: async (file) => {
        try {
          const imported = await PublikImportImage(file, file.name || "canvas.png");
          return { token: imported.token, url: imported.url };
        } catch (err) {
          showCommandError(err, CANVAS_FALLBACK);
          return null;
        }
      },

      uploadImage: publikUploadImage,

      renderBaseImageSelector: ({ onImageSelect, showLoading }) => (
        <BaseImageSelector
          onImageSelect={onImageSelect}
          showLoading={showLoading}
        />
      ),
    }),
    [],
  );
};

// ─── PageDraw wrapper ──────────────────────────────────────────────────────────
const PageDraw = () => {
  useTauriEventBridges();
  const adapter = useTauriAdapter();
  return <PageDrawLib adapter={adapter} />;
};

export default PageDraw;
