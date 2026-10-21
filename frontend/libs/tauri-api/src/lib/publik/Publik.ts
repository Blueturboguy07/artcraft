import { invoke } from "@tauri-apps/api/core";
import { CommandSuccessStatus } from "../common/CommandStatus";

// publik API (publikhq.com): ArtCraft's AI step for GPT Image 1 and "Improve prompt". The
// Rust side owns the provider choice, the credential and every network call; these commands
// never return a key.

export type PublikProviderKind = "publik" | "own" | "not_set_up";

export interface PublikLink {
  label: string;
  url: string;
}

export interface PublikNotice {
  message: string;
  maybe_link?: PublikLink | null;
}

export interface PublikTexts {
  disclosure: string;
  disclosure_data: string;
  terms_url: string;
  sign_in: string;
  add_plan: string;
  later: string;
}

export interface PublikStatus {
  provider: PublikProviderKind;
  status_line: string;
  balance_line: string;
  cost_sentence: string;
  claimed: boolean;
  maybe_account_link?: PublikLink | null;
  dashboard_url: string;
  can_provision: boolean;
  wants_first_run: boolean;
  owes_first_card: boolean;
  supports_images: boolean;
  maybe_own_key_service?: string | null;
  maybe_own_key_model?: string | null;
  maybe_own_key_base_url?: string | null;
  last_charge: string;
  maybe_notice?: PublikNotice | null;
  texts: PublikTexts;
}

export interface PublikSetOwnKeyResult {
  check_line: string;
  status: PublikStatus;
}

export interface PublikImprovePromptResult {
  suggestion: string;
  charge_line: string;
}

interface CommandSuccess<T> {
  status: CommandSuccessStatus.Success;
  payload: T;
}

/** The only links the publik UI opens. Anything else is dropped. */
export const isPublikLink = (url: string | undefined | null): url is string =>
  typeof url === "string" && url.startsWith("https://publikhq.com/");

const run = async <T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> => {
  const result = await invoke<CommandSuccess<T>>(command, args);
  return result.payload;
};

export const PublikGetStatus = () =>
  run<PublikStatus>("publik_get_status_command");

/** "Continue" after the disclosure: provisions this computer. No key to paste. */
export const PublikLinkComputer = () =>
  run<PublikStatus>("publik_link_computer_command");

/** "Check and use this key". The key is sent to its own service once, then kept on disk. */
export const PublikSetOwnKey = (
  key: string,
  maybeBaseUrl?: string,
  maybeModel?: string,
) =>
  run<PublikSetOwnKeyResult>("publik_set_own_key_command", {
    request: {
      key,
      maybe_base_url: maybeBaseUrl || null,
      maybe_model: maybeModel || null,
    },
  });

export const PublikForgetKey = () =>
  run<PublikStatus>("publik_forget_key_command");

/** "Later" or "Done": the first-run card does not open again. */
export const PublikCloseSetup = () =>
  run<PublikStatus>("publik_close_setup_command");

export const PublikMarkFirstCardShown = () =>
  run<PublikStatus>("publik_mark_first_card_shown_command");

export const PublikDismissNotice = () =>
  run<PublikStatus>("publik_dismiss_notice_command");

export const PublikImprovePrompt = (prompt: string) =>
  run<PublikImprovePromptResult>("publik_improve_prompt_command", {
    request: { prompt },
  });

// ── Local media: imports, results, speech and transcription ────────────────────
//
// Every image, speech clip and transcript lives on this computer. Rust stores the file, gives it
// a local token (`publik_…`) and an `asset://` URL, and lists the results newest first. Nothing
// goes to an ArtCraft account.

/** The model of a stored result. */
export type PublikResultModel = "gpt_image_1" | "nano_banana" | "speech";

export interface PublikMedia {
  token: string;
  url: string;
}

export interface PublikImportedImage extends PublikMedia {
  width: number;
  height: number;
}

export interface PublikResult {
  task_id: string;
  created_at: string;
  model: PublikResultModel;
  prompt: string;
  images: PublikMedia[];
  audio: PublikMedia | null;
}

export interface PublikSpeechResult extends PublikMedia {
  charge_line: string;
}

export interface PublikTranscribeResult {
  text: string;
  charge_line: string;
}

/** The voices publik API speaks with. */
export const PUBLIK_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type PublikVoice = (typeof PUBLIK_VOICES)[number];

/**
 * How the image bytes travel to `publik_import_image_command`. Change this one line if Rust
 * takes a byte array: "base64" sends `base64`, "bytes" sends `bytes` (number[]).
 */
export const PUBLIK_IMPORT_ENCODING: "base64" | "bytes" = "base64";

/** The `request` body for `publik_import_image_command`. */
export const publikImportImageRequest = (
  bytes: Uint8Array,
  fileName: string,
): Record<string, unknown> =>
  PUBLIK_IMPORT_ENCODING === "base64"
    ? { base64: bytesToBase64(bytes), file_name: fileName }
    : { bytes: Array.from(bytes), file_name: fileName };

/** Copy an image into the local library. Returns its token and `asset://` URL. */
export const PublikImportImage = async (
  file: Blob,
  fileName?: string,
): Promise<PublikImportedImage> => {
  const bytes = await readBlobBytes(file);
  const name = fileName || (file instanceof File && file.name) || "image.png";
  return run<PublikImportedImage>("publik_import_image_command", {
    request: publikImportImageRequest(bytes, name),
  });
};

/** The stored results, newest first. They survive restarts. */
export const PublikListResults = (limit?: number) =>
  run<PublikResult[]>("publik_list_results_command", {
    request: limit === undefined ? {} : { limit },
  });

/** Text to speech through publik API (or the own key). */
export const PublikSpeech = (text: string, voice: PublikVoice) =>
  run<PublikSpeechResult>("publik_speech_command", {
    request: { text, voice },
  });

/** Transcribe the audio file at `path`. */
export const PublikTranscribe = (path: string, language?: string) =>
  run<PublikTranscribeResult>("publik_transcribe_command", {
    request: language ? { path, language } : { path },
  });

/** The bytes of a Blob. Uses FileReader where Blob.arrayBuffer is missing (older engines). */
const readBlobBytes = async (blob: Blob): Promise<Uint8Array> => {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.readAsArrayBuffer(blob);
  });
};

/** Base64 without the `data:` prefix. Works for large images (chunked). */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};
