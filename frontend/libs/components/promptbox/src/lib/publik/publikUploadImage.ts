import { UploaderStates } from "@storyteller/common";
import type { UploadMediaFn } from "@storyteller/api";
import { PublikImportImage, commandErrorMessage } from "@storyteller/tauri-api";
import { toast } from "@storyteller/ui-toaster";

/**
 * The image "upload" for every kept page: Rust copies the image into the local library
 * (`publik_import_image_command`) and returns a local token. Nothing goes to an ArtCraft
 * account. Same signature as the old cloud upload, so the prompt box and the deck keep
 * working unchanged.
 */
export const publikUploadImage: UploadMediaFn = async ({
  assetFile,
  progressCallback,
}) => {
  progressCallback({ status: UploaderStates.uploadingImage });
  try {
    const image = await PublikImportImage(assetFile, assetFile.name);
    progressCallback({ status: UploaderStates.success, data: image.token });
  } catch (err) {
    const message = commandErrorMessage(
      err,
      "Could not add the image. Use a PNG, JPEG or WebP file.",
    );
    toast.error(message);
    progressCallback({
      status: UploaderStates.imageCreateError,
      errorMessage: message,
    });
  }
};
