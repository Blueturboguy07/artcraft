import { useEffect, useState } from "react";
import { Button } from "@storyteller/ui-button";
import {
  PublikDismissNotice,
  PublikForgetKey,
  commandErrorMessage,
} from "@storyteller/tauri-api";
import {
  PublikSetupFlow,
  openPublikLink,
  usePublikStore,
} from "@storyteller/provider-setup-modal";

/**
 * The publik API provider's settings: the same two choices as the setup card, the status line,
 * the balance or charge line, and the one account link.
 */
export const PublikAccountBlock = () => {
  const status = usePublikStore((s) => s.status);
  const refresh = usePublikStore((s) => s.refresh);
  const setStatus = usePublikStore((s) => s.setStatus);
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const forget = async () => {
    setError(undefined);
    try {
      setStatus(await PublikForgetKey());
    } catch (err) {
      setError(commandErrorMessage(err, "Could not remove the key."));
    }
  };

  const dismissNotice = async () => {
    try {
      setStatus(await PublikDismissNotice());
    } catch (err) {
      console.error("publik: could not dismiss the notice", err);
    }
  };

  const isPublik = status?.provider === "publik";
  const isOwn = status?.provider === "own";
  const notice = status?.maybe_notice;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
            AI provider (publik API)
          </p>
          <p className="truncate text-sm font-medium text-base-fg/80">
            {status?.status_line ?? "Loading…"}
          </p>
        </div>
        {!isChanging && (
          <Button
            variant={status?.provider === "not_set_up" ? "primary" : "secondary"}
            className="h-9 shrink-0 px-3"
            disabled={!status}
            onClick={() => setIsChanging(true)}
          >
            {status?.provider === "not_set_up" ? "Set up AI…" : "Change…"}
          </Button>
        )}
      </div>

      {isPublik && status && (
        <p className="text-xs leading-relaxed text-base-fg/55">
          {status.cost_sentence}
        </p>
      )}
      {status?.last_charge && (
        <p className="text-xs text-base-fg/55">{status.last_charge}</p>
      )}

      {!isChanging && status && (isPublik || isOwn) && (
        <div className="flex flex-wrap gap-2">
          {isPublik && status.maybe_account_link && (
            <Button
              className="h-8 px-3 text-xs"
              onClick={() => openPublikLink(status.maybe_account_link?.url)}
            >
              {status.maybe_account_link.label}
            </Button>
          )}
          {isPublik && (
            <Button
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={() => openPublikLink(status.dashboard_url)}
            >
              Dashboard
            </Button>
          )}
          <Button variant="destructive" className="h-8 px-3 text-xs" onClick={forget}>
            {isPublik ? "Forget this computer's key" : "Remove key"}
          </Button>
        </div>
      )}

      {notice && (
        <div className="flex flex-col gap-2 border border-amber-400/40 p-2.5">
          <p className="text-sm text-amber-300">{notice.message}</p>
          <div className="flex gap-2">
            {notice.maybe_link && (
              <Button
                className="h-8 px-3 text-xs"
                onClick={() => openPublikLink(notice.maybe_link?.url)}
              >
                {notice.maybe_link.label}
              </Button>
            )}
            <Button variant="ghost" className="h-8 px-3 text-xs" onClick={dismissNotice}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {isChanging && (
        <div className="mt-1 border border-ui-panel-border p-3">
          <PublikSetupFlow
            entry={status?.owes_first_card ? "card" : "pick"}
            onClose={() => {
              setIsChanging(false);
              refresh();
            }}
          />
        </div>
      )}
    </div>
  );
};
