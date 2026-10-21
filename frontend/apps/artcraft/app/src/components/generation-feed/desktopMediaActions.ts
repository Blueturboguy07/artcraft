import toast from "react-hot-toast";
import {
  DownloadMediaFile,
  commandErrorMessage,
  useModelsStore,
} from "@storyteller/tauri-api";
import { usePromptImageStore } from "@storyteller/ui-promptbox";
import {
  useClassyModelSelectorStore,
  ModelPage,
} from "@storyteller/ui-model-selector";
import { IMAGE_MODELS_BY_ID } from "@storyteller/model-list";
import {
  galleryModalLightboxVisible,
  galleryModalVisibleDuringDrag,
  galleryModalVisibleViewMode,
} from "@storyteller/ui-gallery-modal";
import type { GalleryItem } from "@storyteller/ui-generation-list";
import { useTabStore } from "~/pages/Stores/TabState";

// Actions on library items, shared by the top bar library and the create-page
// feeds. They use global stores through getState(), so any caller can use them.
// Files live on this computer: Rust copies them by their local token.

/** The image models a stored prompt can go back to. */
const RECREATE_IMAGE_MODELS = new Set(["gpt_image_1", "nano_banana"]);

/** Save one stored file (by its local token) to the downloads folder. */
export async function downloadMediaFileToDisk(
  mediaToken: string,
  _mediaClass?: string,
): Promise<boolean> {
  try {
    await DownloadMediaFile(mediaToken);
    toast.success("Saved to your downloads folder.");
    return true;
  } catch (error) {
    toast.error(commandErrorMessage(error, "Could not save the file. Try again."));
    return false;
  }
}

/**
 * Save the selected items to the downloads folder, one by one. One toast shows
 * the progress and the result. Returns true when at least one file was saved.
 */
export async function downloadMediaFilesToFolder(
  items: GalleryItem[],
): Promise<boolean> {
  if (items.length === 0) return false;

  const toastId = toast.loading(`Saving 1 of ${items.length}…`);
  let failedCount = 0;
  let lastError: unknown = null;
  for (let i = 0; i < items.length; i++) {
    toast.loading(`Saving ${i + 1} of ${items.length}…`, { id: toastId });
    try {
      await DownloadMediaFile(items[i].id);
    } catch (error) {
      failedCount++;
      lastError = error;
    }
  }

  const saved = items.length - failedCount;
  if (failedCount === 0) {
    toast.success(
      `Saved ${saved} ${saved === 1 ? "file" : "files"} to your downloads folder.`,
      { id: toastId },
    );
  } else if (saved > 0) {
    toast.error(`Could not save ${failedCount} of ${items.length} files.`, {
      id: toastId,
    });
  } else {
    toast.error(
      commandErrorMessage(lastError, "Could not save the selected files."),
      { id: toastId },
    );
  }
  return saved > 0;
}

/**
 * "Use this prompt": put the prompt into the image prompt box, select the model
 * when it is an image model (GPT Image 1 or Nano Banana), and open the Image page.
 */
export function applyRecreateFromPrompt(prompt: string, modelId?: string) {
  try {
    usePromptImageStore.getState().setPrompt(prompt);

    if (modelId && RECREATE_IMAGE_MODELS.has(modelId)) {
      const model =
        useModelsStore
          .getState()
          .imageModels.find((m) => m.tauriId === modelId || m.id === modelId) ??
        IMAGE_MODELS_BY_ID.get(modelId);
      if (model) {
        useClassyModelSelectorStore
          .getState()
          .setSelectedModel(ModelPage.TextToImage, model);
      }
    }

    useTabStore.getState().setActiveTab("IMAGE");
    galleryModalVisibleViewMode.value = false;
    galleryModalVisibleDuringDrag.value = false;
    galleryModalLightboxVisible.value = false;
  } catch {
    // The prompt box keeps its text.
  }
}

/**
 * "Use as reference": the image becomes the reference image of the image prompt
 * (publik API takes one), and the Image page opens.
 */
export function applyUseAsReference(url: string, mediaToken?: string) {
  if (!mediaToken) {
    toast.error("Could not use this image. Try again.");
    return;
  }
  usePromptImageStore.getState().setReferenceImages([
    { id: mediaToken, url, file: new File([], mediaToken), mediaToken },
  ]);
  useTabStore.getState().setActiveTab("IMAGE");
  galleryModalVisibleViewMode.value = false;
  galleryModalVisibleDuringDrag.value = false;
  galleryModalLightboxVisible.value = false;
  toast.success("Reference image added to the prompt.");
}
