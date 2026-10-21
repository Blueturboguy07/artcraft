import { toast } from "@storyteller/ui-toaster";
import { DownloadMediaFile, commandErrorMessage } from "@storyteller/tauri-api";
import { usePublikStore } from "@storyteller/provider-setup-modal";

// Shared error and download handling for the Audio page. Every call goes to Rust (publik API
// or the person's own key). Nothing goes to an ArtCraft account.

/** Show one plain sentence. If AI is not set up, open the setup card. */
export function showAudioError(err: unknown, fallback: string): void {
  console.error("[Audio]", err);
  toast.error(commandErrorMessage(err, fallback));
  if ((err as { error_type?: string } | undefined)?.error_type === "needs_publik_setup") {
    usePublikStore.getState().openSetup("pick");
  }
}

/** Read the balance and the charge line again after a paid call. */
export function refreshPublikStatus(): void {
  void usePublikStore.getState().refresh();
}

/** Save a stored speech clip (local token) to the Downloads folder. */
export async function downloadAudio(token: string): Promise<void> {
  try {
    await DownloadMediaFile(token);
    toast.success("The audio file is in your Downloads folder.");
  } catch (err) {
    showAudioError(err, "Could not save the audio file. Try again.");
  }
}
