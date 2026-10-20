import { useState } from "react";
import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { Button } from "@storyteller/ui-button";
import { Tooltip } from "@storyteller/ui-tooltip";
import { PublikImprovePrompt, commandErrorMessage } from "@storyteller/tauri-api";
import { usePublikStore } from "@storyteller/provider-setup-modal";
import { PROMPT_TOOLBAR_ICON_BUTTON_CLASSES } from "../PromptClearAllButton";

interface ImprovePromptButtonProps {
  prompt: string;
  onAccept: (prompt: string) => void;
}

/**
 * "Improve prompt": sends the current prompt through publik API (or the person's own key) only
 * on a click, then offers the suggestion. The prompt changes only when the person accepts.
 */
export const ImprovePromptButton = ({ prompt, onAccept }: ImprovePromptButtonProps) => {
  const refresh = usePublikStore((s) => s.refresh);
  const openSetup = usePublikStore((s) => s.openSetup);
  const [isWorking, setIsWorking] = useState(false);
  const [suggestion, setSuggestion] = useState<string | undefined>(undefined);
  const [chargeLine, setChargeLine] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const improve = async () => {
    setError(undefined);
    setSuggestion(undefined);
    const status = usePublikStore.getState().status ?? (await refresh());
    if (status?.provider === "not_set_up") {
      openSetup("pick");
      return;
    }
    setIsWorking(true);
    try {
      const result = await PublikImprovePrompt(prompt);
      setSuggestion(result.suggestion);
      setChargeLine(result.charge_line);
      refresh();
    } catch (err) {
      const message = commandErrorMessage(err, "The prompt could not be improved. Try again.");
      // A 402 or a refused key becomes the notice under the prompt box, with its one link.
      // Show it there only, never a second copy here.
      const next = await refresh();
      if (next?.maybe_notice?.message !== message) {
        setError(message);
      }
    } finally {
      setIsWorking(false);
    }
  };

  const close = () => {
    setSuggestion(undefined);
    setError(undefined);
  };

  return (
    <div className="relative">
      <Tooltip content="Improve prompt" position="top" className="z-50" delay={200}>
        <button
          type="button"
          aria-label="Improve prompt"
          onClick={improve}
          disabled={!prompt.trim() || isWorking}
          className={twMerge(
            PROMPT_TOOLBAR_ICON_BUTTON_CLASSES,
            "focus:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-base-fg/50",
          )}
        >
          {isWorking ? (
            <LoaderCircleIcon className="h-4 w-4 animate-spin" />
          ) : (
            <SparklesIcon className="h-4 w-4" />
          )}
        </button>
      </Tooltip>
      {(suggestion || error) && (
        <div
          className="glass absolute bottom-full right-0 z-30 mb-2 flex w-[26rem] max-w-[80vw] flex-col gap-2 p-3 text-sm text-base-fg"
          role="dialog"
          aria-label="Suggested prompt"
        >
          {suggestion && (
            <>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/60">
                Suggested prompt
              </p>
              <p className="max-h-48 overflow-y-auto leading-relaxed">{suggestion}</p>
              {chargeLine && <p className="text-xs text-base-fg/50">{chargeLine}</p>}
              <div className="flex gap-2">
                <Button
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    onAccept(suggestion);
                    close();
                  }}
                >
                  Use this prompt
                </Button>
                <Button variant="secondary" className="h-8 px-3 text-xs" onClick={close}>
                  Keep mine
                </Button>
              </div>
            </>
          )}
          {error && (
            <>
              <p className="text-amber-300" role="alert">
                {error}
              </p>
              <div>
                <Button variant="secondary" className="h-8 px-3 text-xs" onClick={close}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
