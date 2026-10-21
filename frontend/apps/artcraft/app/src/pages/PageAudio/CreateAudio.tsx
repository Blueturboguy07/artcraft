import { useEffect } from "react";
import { WandSparklesIcon } from "lucide-react";
import { Button } from "@storyteller/ui-button";
import { usePublikStore } from "@storyteller/provider-setup-modal";
import { SpeechPanel } from "./SpeechPanel";
import { TranscribePanel } from "./TranscribePanel";

// The Audio page: two publik API lines, speech and transcription. Both run through Rust with
// the publik balance or the person's own key. Results stay on this computer.

const CreateAudio = () => {
  const status = usePublikStore((s) => s.status);
  const refresh = usePublikStore((s) => s.refresh);
  const openSetup = usePublikStore((s) => s.openSetup);

  useEffect(() => {
    if (!status) void refresh();
  }, [status, refresh]);

  const notSetUp = status?.provider === "not_set_up";

  return (
    <div className="h-[calc(100vh-56px)] w-full overflow-y-auto bg-ui-background text-base-fg">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-medium leading-[1.05] tracking-[-0.03em]">
              Audio
            </h1>
            {status?.status_line && (
              <p className="text-sm text-base-fg/60">{status.status_line}</p>
            )}
          </div>
          {notSetUp && (
            <Button
              variant="primary"
              icon={WandSparklesIcon}
              className="h-9"
              onClick={() => openSetup("pick")}
            >
              Set up AI
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SpeechPanel />
          <TranscribePanel />
        </div>
      </div>
    </div>
  );
};

export default CreateAudio;
