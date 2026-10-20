import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@storyteller/ui-button";
import { Input } from "@storyteller/ui-input";
import {
  OpenUrl,
  PublikCloseSetup,
  PublikLinkComputer,
  PublikMarkFirstCardShown,
  PublikSetOwnKey,
  commandErrorMessage,
  isPublikLink,
  type PublikStatus,
} from "@storyteller/tauri-api";
import { usePublikStore, type PublikSetupEntry } from "./publik-store";

// The two choices of craft-publik's setup flow, in ArtCraft's own UI: publik API (link this
// computer; no key to paste) or the person's own key. Copy follows the crate's egui flow.

type Step = "pick" | "disclosure" | "linking" | "card" | "own_key";

export interface PublikSetupFlowProps {
  entry?: PublikSetupEntry;
  /** Close the host (the modal, or the inline panel in Settings). */
  onClose: () => void;
}

export const openPublikLink = async (url: string | undefined | null) => {
  if (!isPublikLink(url)) return;
  try {
    await OpenUrl(url);
  } catch (error) {
    console.error("publik: could not open the link", error);
  }
};

export function PublikSetupFlow({ entry = "pick", onClose }: PublikSetupFlowProps) {
  const status = usePublikStore((s) => s.status);
  const setStatus = usePublikStore((s) => s.setStatus);
  const refresh = usePublikStore((s) => s.refresh);
  const [step, setStep] = useState<Step>(entry);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!status) refresh();
  }, [status, refresh]);

  const finish = async () => {
    try {
      setStatus(await PublikCloseSetup());
    } catch (err) {
      console.error("publik: could not save the setup choice", err);
    }
    onClose();
  };

  const link = async () => {
    setError(undefined);
    setStep("linking");
    try {
      setStatus(await PublikLinkComputer());
      setStep("card");
    } catch (err) {
      setError(commandErrorMessage(err, "publik API could not set up this computer. Use your own key for now."));
      setStep("pick");
    }
  };

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-fg/70">
        <LoaderCircleIcon className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  switch (step) {
    case "disclosure":
      return (
        <DisclosureStep
          status={status}
          onContinue={link}
          onBack={() => setStep("pick")}
        />
      );
    case "linking":
      return (
        <div className="flex items-center gap-2 text-sm text-base-fg/80" role="status">
          <LoaderCircleIcon className="h-4 w-4 animate-spin" aria-hidden />
          Setting up publik API on this computer…
        </div>
      );
    case "card":
      return <CardStep status={status} onDone={finish} />;
    case "own_key":
      return (
        <OwnKeyStep
          onSaved={(next) => setStatus(next)}
          onDone={onClose}
          onBack={() => setStep("pick")}
        />
      );
    case "pick":
    default:
      return (
        <PickStep
          status={status}
          error={error}
          onPublik={() => {
            setError(undefined);
            setStep("disclosure");
          }}
          onOwnKey={() => {
            setError(undefined);
            setStep("own_key");
          }}
          onLater={finish}
        />
      );
  }
}

function PickStep({
  status,
  error,
  onPublik,
  onOwnKey,
  onLater,
}: {
  status: PublikStatus;
  error?: string;
  onPublik: () => void;
  onOwnKey: () => void;
  onLater: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 text-base-fg">
      <p className="text-sm leading-relaxed text-base-fg/80">
        ArtCraft can use AI for GPT Image 1 and for "Improve prompt". Pick how, or
        come back to this later from Settings &gt; Accounts.
      </p>
      <ChoiceCard
        title="publik API"
        inUse={status.provider === "publik"}
        body="No key to paste. Priced per use in dollars from a publik balance; link this computer once for $0.05 of free use. You do not need an ArtCraft account."
      >
        {status.can_provision ? (
          <Button className="h-9 px-3" onClick={onPublik}>
            Use publik API
          </Button>
        ) : (
          <p className="text-sm text-base-fg/50">
            This build has no publik API app token.
          </p>
        )}
      </ChoiceCard>
      <ChoiceCard
        title="Your own key"
        inUse={status.provider === "own"}
        body="Paste a key from OpenAI, OpenRouter, Groq, Google or Anthropic. Billed by that service, not by publik. Images need an OpenAI key."
      >
        <Button variant="secondary" className="h-9 px-3" onClick={onOwnKey}>
          Use my own key
        </Button>
      </ChoiceCard>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button variant="ghost" className="h-9 px-3" onClick={onLater}>
          {status.texts.later}
        </Button>
      </div>
    </div>
  );
}

function DisclosureStep({
  status,
  onContinue,
  onBack,
}: {
  status: PublikStatus;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-base-fg">
      <p className="font-medium">Before publik API is set up</p>
      <p className="text-sm leading-relaxed text-base-fg/80">
        {status.texts.disclosure}
      </p>
      <p className="text-sm leading-relaxed text-base-fg/80">
        {status.texts.disclosure_data}
      </p>
      <p className="text-sm text-base-fg/80">
        The terms:{" "}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-base-fg"
          onClick={() => openPublikLink(status.texts.terms_url)}
        >
          publikhq.com/terms
        </button>
      </p>
      <div className="flex gap-2 pt-1">
        <Button className="h-9 px-3" onClick={onContinue}>
          Continue
        </Button>
        <Button variant="secondary" className="h-9 px-3" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

function CardStep({
  status,
  onDone,
}: {
  status: PublikStatus;
  onDone: () => void;
}) {
  const setStatus = usePublikStore((s) => s.setStatus);

  // The card with the balance line and the cost sentence shows once.
  useEffect(() => {
    PublikMarkFirstCardShown()
      .then(setStatus)
      .catch((err) => console.error("publik: could not save the card state", err));
  }, [setStatus]);

  const accountLink = status.maybe_account_link;
  return (
    <div className="flex flex-col gap-3 text-base-fg">
      <p className="font-medium">publik API is set up on this computer</p>
      <p className="text-sm font-semibold">{status.balance_line}</p>
      <p className="text-sm leading-relaxed text-base-fg/80">
        {status.cost_sentence}
      </p>
      <div className="flex gap-2 pt-1">
        {accountLink && (
          <Button className="h-9 px-3" onClick={() => openPublikLink(accountLink.url)}>
            {accountLink.label}
          </Button>
        )}
        <Button variant="secondary" className="h-9 px-3" onClick={onDone}>
          {status.claimed ? "Done" : status.texts.later}
        </Button>
      </div>
    </div>
  );
}

function OwnKeyStep({
  onSaved,
  onDone,
  onBack,
}: {
  onSaved: (status: PublikStatus) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkLine, setCheckLine] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const check = async () => {
    setChecking(true);
    setError(undefined);
    setCheckLine(undefined);
    try {
      const result = await PublikSetOwnKey(key, baseUrl, model);
      setCheckLine(result.check_line);
      onSaved(result.status);
    } catch (err) {
      setError(commandErrorMessage(err, "The service did not accept this key."));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-base-fg">
      <p className="font-medium">Your own key</p>
      <div className="flex items-center gap-3">
        <Input
          className="flex-1"
          aria-label="API key"
          type={showKey ? "text" : "password"}
          value={key}
          disabled={checking}
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…, sk-or-…, gsk_…, AIza…, sk-ant-…"
          onChange={(e) => setKey(e.target.value)}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-base-fg/70">
          <input
            type="checkbox"
            checked={showKey}
            onChange={(e) => setShowKey(e.target.checked)}
          />
          Show
        </label>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-base-fg/70">Advanced</summary>
        <div className="mt-2 flex flex-col gap-2">
          <Input
            label="Base URL"
            value={baseUrl}
            disabled={checking}
            placeholder="The service's URL, ends in /v1"
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <Input
            label="Model"
            value={model}
            disabled={checking}
            placeholder="Picked for you when empty"
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
      </details>
      {checkLine && <p className="text-sm text-primary">{checkLine}</p>}
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {checking ? (
          <span className="flex items-center gap-2 text-sm text-base-fg/80" role="status">
            <LoaderCircleIcon className="h-4 w-4 animate-spin" aria-hidden />
            Checking the key…
          </span>
        ) : (
          <>
            <Button
              className="h-9 px-3"
              disabled={!key.trim()}
              onClick={check}
            >
              Check and use this key
            </Button>
            {checkLine && (
              <Button variant="secondary" className="h-9 px-3" onClick={onDone}>
                Done
              </Button>
            )}
            <Button variant="ghost" className="h-9 px-3" onClick={onBack}>
              Back
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({
  title,
  inUse,
  body,
  children,
}: {
  title: string;
  inUse: boolean;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border border-ui-panel-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {title}
        {inUse && <span className="font-normal text-base-fg/50">· in use</span>}
      </p>
      <p className="text-sm leading-relaxed text-base-fg/70">{body}</p>
      <div>{children}</div>
    </div>
  );
}
