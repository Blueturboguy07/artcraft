import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "@storyteller/ui-button";
import { PublikDismissNotice } from "@storyteller/tauri-api";
import { openPublikLink, usePublikStore } from "@storyteller/provider-setup-modal";

// Under the prompt box while publik API is the provider: the notice a failed call left (one
// message, at most one link), or the last charge line. Never a second copy of the link.

const REFRESH_EVENTS = ["generation-complete-event", "generation-failed-event"];

export const PublikResultBar = () => {
  const status = usePublikStore((s) => s.status);
  const refresh = usePublikStore((s) => s.refresh);
  const setStatus = usePublikStore((s) => s.setStatus);

  useEffect(() => {
    refresh();
    let cancelled = false;
    const unlisteners: Promise<UnlistenFn>[] = REFRESH_EVENTS.map((name) =>
      listen(name, () => {
        if (!cancelled) refresh();
      }),
    );
    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten.then((stop) => stop()));
    };
  }, [refresh]);

  const notice = status?.maybe_notice;
  if (notice) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="status">
        <span className="text-amber-300">{notice.message}</span>
        {notice.maybe_link && (
          <Button
            className="h-7 px-2.5 text-xs"
            onClick={() => openPublikLink(notice.maybe_link?.url)}
          >
            {notice.maybe_link.label}
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-7 px-2.5 text-xs"
          onClick={async () => {
            try {
              setStatus(await PublikDismissNotice());
            } catch (err) {
              console.error("publik: could not dismiss the notice", err);
            }
          }}
        >
          Dismiss
        </Button>
      </div>
    );
  }

  const line = status?.last_charge || status?.status_line;
  if (!line) return null;
  return <p className="mt-3 text-xs text-base-fg/50">{line}</p>;
};
