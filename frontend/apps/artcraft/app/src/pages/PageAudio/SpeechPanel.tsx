import { useCallback, useEffect, useState } from "react";
import { DownloadIcon, Volume2Icon } from "lucide-react";
import { Button } from "@storyteller/ui-button";
import {
  PUBLIK_VOICES,
  PublikListResults,
  PublikSpeech,
  type PublikResult,
  type PublikSpeechResult,
  type PublikVoice,
} from "@storyteller/tauri-api";
import { downloadAudio, refreshPublikStatus, showAudioError } from "./publikAudioActions";

// Text to speech through publik API. The clip is stored on this computer and appears in the
// list below; it stays there after a restart.

/** OpenAI's speech endpoint takes up to 4096 characters. */
const MAX_SPEECH_CHARS = 4096;

/** How many earlier clips the list shows. */
const RECENT_LIMIT = 20;

export const SpeechPanel = () => {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<PublikVoice>("alloy");
  const [isBusy, setIsBusy] = useState(false);
  const [result, setResult] = useState<PublikSpeechResult | null>(null);
  const [recent, setRecent] = useState<PublikResult[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const results = await PublikListResults();
      setRecent(
        results
          .filter((item) => item.model === "speech" && item.audio)
          .slice(0, RECENT_LIMIT),
      );
    } catch (err) {
      console.error("[Audio] could not list the speech clips", err);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const trimmed = text.trim();

  const handleGenerate = async () => {
    if (!trimmed || isBusy) return;
    setIsBusy(true);
    try {
      const speech = await PublikSpeech(trimmed, voice);
      setResult(speech);
      refreshPublikStatus();
      void loadRecent();
    } catch (err) {
      showAudioError(err, "Could not make the speech. Try again.");
    } finally {
      setIsBusy(false);
    }
  };

  // The newest clip shows above; the list shows the clips before it.
  const earlier = recent.filter((item) => item.audio?.token !== result?.token);

  return (
    <section className="flex min-h-0 flex-col gap-4 border border-ui-panel-border bg-ui-panel p-5">
      <header className="flex flex-col gap-1">
        <p className="hud-label flex items-center gap-2 text-base-fg/55">
          <Volume2Icon aria-hidden className="h-3.5 w-3.5" />
          Speech
        </p>
        <h2 className="text-lg font-semibold text-base-fg">Text to speech</h2>
        <p className="text-sm text-base-fg/60">
          Type the text. Select a voice. Then click Generate.
        </p>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-base-fg/70">Text</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_SPEECH_CHARS}
          rows={6}
          placeholder="Type what the voice says…"
          className="promptbox-scrollbar w-full resize-y rounded-[3px] border border-ui-controls-border bg-ui-controls/40 p-3 text-sm text-base-fg placeholder-base-fg/40 focus:border-primary focus:outline-none"
        />
        <span className="self-end text-[10px] tabular-nums text-base-fg/40">
          {text.length} / {MAX_SPEECH_CHARS}
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-fg/70">Voice</span>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value as PublikVoice)}
            className="h-9 min-w-[10rem] rounded-[3px] border border-ui-controls-border bg-ui-controls px-2 text-sm capitalize text-base-fg focus:border-primary focus:outline-none"
          >
            {PUBLIK_VOICES.map((v) => (
              <option key={v} value={v} className="capitalize">
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="primary"
          className="h-9"
          onClick={handleGenerate}
          disabled={!trimmed || isBusy}
          loading={isBusy}
        >
          Generate
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-2 border-t border-ui-panel-border pt-4">
          <SpeechClip url={result.url} token={result.token} />
          {result.charge_line && (
            <p className="text-xs text-base-fg/60">{result.charge_line}</p>
          )}
        </div>
      )}

      {earlier.length > 0 && (
        <div className="flex min-h-0 flex-col gap-2 border-t border-ui-panel-border pt-4">
          <p className="hud-label text-base-fg/55">Earlier clips</p>
          <ul className="promptbox-scrollbar flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
            {earlier.map((item) =>
              item.audio ? (
                <li key={item.task_id} className="flex flex-col gap-1">
                  <p className="truncate text-xs text-base-fg/70" title={item.prompt}>
                    {item.prompt || "Speech"}
                  </p>
                  <SpeechClip url={item.audio.url} token={item.audio.token} />
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}
    </section>
  );
};

const SpeechClip = ({ url, token }: { url: string; token: string }) => {
  const [isSaving, setIsSaving] = useState(false);
  const save = async () => {
    setIsSaving(true);
    await downloadAudio(token);
    setIsSaving(false);
  };
  return (
    <div className="flex items-center gap-2">
      <audio controls src={url} className="h-9 min-w-0 flex-1" preload="metadata" />
      <Button
        variant="secondary"
        icon={DownloadIcon}
        className="h-9"
        onClick={save}
        loading={isSaving}
        aria-label="Download"
      >
        Download
      </Button>
    </div>
  );
};
