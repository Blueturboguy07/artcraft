import { useEffect, useRef, useState } from "react";
import { WandSparklesIcon } from "lucide-react";
import { Modal } from "@storyteller/ui-modal";
import { PublikCloseSetup } from "@storyteller/tauri-api";
import { PublikSetupFlow } from "./publik-setup-flow";
import { usePublikStore } from "./publik-store";

/** The first launch asks a moment after the window is up, as the egui apps do. */
const FIRST_RUN_DELAY_MS = 1500;

export interface PublikSetupModalProps {
  /** Another dialog (the ArtCraft sign-in) is on screen. The card waits for it to close. */
  blocked?: boolean;
}

/**
 * The publik setup card. It opens once on the first launch (closed for good by "Later"), and
 * whenever the prompt box or the sign-in screen asks for it.
 */
export function PublikSetupModal({ blocked = false }: PublikSetupModalProps) {
  const isSetupOpen = usePublikStore((s) => s.isSetupOpen);
  const setupEntry = usePublikStore((s) => s.setupEntry);
  const openSetup = usePublikStore((s) => s.openSetup);
  const closeSetup = usePublikStore((s) => s.closeSetup);
  const refresh = usePublikStore((s) => s.refresh);
  const setStatus = usePublikStore((s) => s.setStatus);
  const firstRunChecked = useRef(false);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (blocked || firstRunChecked.current) return;
    const timer = window.setTimeout(async () => {
      firstRunChecked.current = true;
      const status = await refresh();
      if (status?.owes_first_card) {
        openSetup("card");
      } else if (status?.wants_first_run) {
        openSetup("pick");
      }
    }, FIRST_RUN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [blocked, refresh, openSetup]);

  useEffect(() => {
    if (isSetupOpen) setOpenCount((count) => count + 1);
  }, [isSetupOpen]);

  // Closing the first-run card by any means counts as "Later": it shows once.
  const handleClose = async () => {
    closeSetup();
    const status = usePublikStore.getState().status;
    if (status?.wants_first_run || status?.owes_first_card) {
      try {
        setStatus(await PublikCloseSetup());
      } catch (err) {
        console.error("publik: could not save the setup choice", err);
      }
    } else {
      refresh();
    }
  };

  return (
    <Modal
      isOpen={isSetupOpen && !blocked}
      onClose={handleClose}
      className="max-w-xl p-6"
      showClose={true}
      accessibleTitle="Set up AI"
    >
      <div className="flex flex-col gap-5 text-base-fg">
        <div className="flex flex-col gap-2">
          <p className="hud-label flex items-center gap-2 text-base-fg/55">
            <WandSparklesIcon aria-hidden className="h-3.5 w-3.5" />
            AI provider
          </p>
          <h1 className="font-display text-3xl font-medium leading-[1.05] tracking-[-0.03em]">
            Set up AI
          </h1>
        </div>
        <PublikSetupFlow
          key={openCount}
          entry={setupEntry}
          onClose={() => {
            closeSetup();
            refresh();
          }}
        />
      </div>
    </Modal>
  );
}

export default PublikSetupModal;
