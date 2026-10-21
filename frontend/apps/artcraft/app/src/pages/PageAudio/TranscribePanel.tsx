import { useEffect, useRef, useState } from "react";
import { CopyIcon, FileAudioIcon, FolderOpenIcon, MicIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { twMerge } from "tailwind-merge";
import { Button } from "@storyteller/ui-button";
import { toast } from "@storyteller/ui-toaster";
import { PublikTranscribe, type PublikTranscribeResult } from "@storyteller/tauri-api";
import { refreshPublikStatus, showAudioError } from "./publikAudioActions";

// Speech to text through publik API. Rust reads the file at the path; the page never
// uploads it anywhere else.

export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "ogg", "flac", "webm", "mp4"];

const LANGUAGES: { value: string; label: string }[] = [
  { value: "", label: "Detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "hi", label: "Hindi" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

export const isAudioPath = (path: string): boolean => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
};

const fileNameOf = (path: string): string => path.split(/[/\\]/).pop() ?? path;

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const TranscribePanel = () => {
  const [path, setPath] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [result, setResult] = useState<PublikTranscribeResult | null>(null);

  // Drop an audio file anywhere on the Audio page: only this panel takes files there.
  const busyRef = useRef(isBusy);
  busyRef.current = isBusy;
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const stop = await getCurrentWebviewWindow().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "enter") {
            setIsDragOver(payload.paths.some(isAudioPath));
          } else if (payload.type === "drop") {
            setIsDragOver(false);
            if (busyRef.current) return;
            const audio = payload.paths.find(isAudioPath);
            if (audio) {
              setPath(audio);
              setResult(null);
            } else if (payload.paths.length > 0) {
              toast.error("Drop an audio file: MP3, WAV, M4A, OGG, FLAC, WebM or MP4.");
            }
          } else if (payload.type === "leave") {
            setIsDragOver(false);
          }
        });
        if (cancelled) stop();
        else unlisten = stop;
      } catch (err) {
        console.error("[Audio] could not listen for dropped files", err);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handlePick = async () => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
      });
      if (typeof picked === "string" && picked) {
        setPath(picked);
        setResult(null);
      }
    } catch (err) {
      showAudioError(err, "Could not open the file picker. Try again.");
    }
  };

  const handleTranscribe = async () => {
    if (!path || isBusy) return;
    setIsBusy(true);
    try {
      const transcript = await PublikTranscribe(path, language || undefined);
      setResult(transcript);
      refreshPublikStatus();
    } catch (err) {
      showAudioError(err, "Could not transcribe the file. Try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      toast.success("The text is on the clipboard.");
    } catch {
      toast.error("Could not copy the text. Select it and copy it by hand.");
    }
  };

  return (
    <section className="flex min-h-0 flex-col gap-4 border border-ui-panel-border bg-ui-panel p-5">
      <header className="flex flex-col gap-1">
        <p className="hud-label flex items-center gap-2 text-base-fg/55">
          <MicIcon aria-hidden className="h-3.5 w-3.5" />
          Transcribe
        </p>
        <h2 className="text-lg font-semibold text-base-fg">Speech to text</h2>
        <p className="text-sm text-base-fg/60">
          Select an audio file or drop it here. Then click Transcribe.
        </p>
      </header>

      <button
        type="button"
        onClick={handlePick}
        disabled={isBusy}
        className={twMerge(
          "flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-ui-controls-border bg-ui-controls/30 p-4 text-sm text-base-fg/70 transition-colors hover:border-white/30 hover:bg-white/5",
          isDragOver && "border-primary bg-primary/10 text-base-fg",
          isBusy && "pointer-events-none opacity-50",
        )}
      >
        {path ? (
          <>
            <FileAudioIcon aria-hidden className="h-6 w-6" />
            <span className="max-w-full truncate font-medium text-base-fg" title={path}>
              {fileNameOf(path)}
            </span>
            <span className="text-xs text-base-fg/50">Click to select a different file.</span>
          </>
        ) : (
          <>
            <FolderOpenIcon aria-hidden className="h-6 w-6" />
            <span>{isDragOver ? "Drop the audio file." : "Click to select an audio file."}</span>
            <span className="text-xs text-base-fg/50">MP3, WAV, M4A, OGG, FLAC, WebM or MP4</span>
          </>
        )}
      </button>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-fg/70">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-9 min-w-[10rem] rounded-[3px] border border-ui-controls-border bg-ui-controls px-2 text-sm text-base-fg focus:border-primary focus:outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value || "detect"} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="primary"
          className="h-9"
          onClick={handleTranscribe}
          disabled={!path || isBusy}
          loading={isBusy}
        >
          Transcribe
        </Button>
      </div>

      {result && (
        <div className="flex min-h-0 flex-col gap-2 border-t border-ui-panel-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="hud-label text-base-fg/55">Text</p>
            <Button
              variant="secondary"
              icon={CopyIcon}
              className="h-8"
              onClick={handleCopy}
              disabled={!result.text}
            >
              Copy
            </Button>
          </div>
          <textarea
            readOnly
            value={result.text}
            rows={8}
            className="promptbox-scrollbar w-full resize-y rounded-[3px] border border-ui-controls-border bg-ui-controls/40 p-3 text-sm text-base-fg focus:outline-none"
          />
          {result.charge_line && (
            <p className="text-xs text-base-fg/60">{result.charge_line}</p>
          )}
        </div>
      )}
    </section>
  );
};
