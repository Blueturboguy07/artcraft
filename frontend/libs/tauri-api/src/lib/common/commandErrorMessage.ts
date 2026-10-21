/**
 * The one sentence a person sees when a Tauri command fails. Rust sends
 * `{ status, error_type, error_message }`; the message is shown as is, unless it is
 * missing or looks like raw JSON (a server body), in which case the fallback sentence
 * shows instead. A JavaScript programming error (TypeError and similar) is never shown.
 */
export function commandErrorMessage(error: unknown, fallback: string): string {
  if (isProgrammingError(error)) return fallback;
  if (error && typeof error === "object") {
    const command = error as {
      error_message?: unknown;
      error_details?: { error_message?: unknown } | null;
      message?: unknown;
    };
    return (
      readable(command.error_message) ??
      readable(command.error_details?.error_message) ??
      readable(command.message) ??
      fallback
    );
  }
  return readable(error) ?? fallback;
}

/** A message a person can read: a non-empty string that is not a JSON body. */
function readable(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  const trimmed = message.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return undefined;
  return trimmed;
}

/** A bug in the page, not a message for the person (for example "Cannot read properties"). */
function isProgrammingError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError ||
    error instanceof RangeError
  );
}
