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
