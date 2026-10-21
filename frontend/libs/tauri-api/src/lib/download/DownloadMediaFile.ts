import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";

export interface DownloadMediaFileSuccess extends CommandResult {
  payload: Record<string, never>;
}

/** Save a stored result (a local `publik_…` token) to the downloads folder. */
export const DownloadMediaFile = async (
  mediaToken: string,
): Promise<DownloadMediaFileSuccess> =>
  (await invoke("download_media_file_command", {
    request: { media_token: mediaToken },
  })) as DownloadMediaFileSuccess;
