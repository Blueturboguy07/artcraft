import { describe, expect, it } from "vitest";
import { commandErrorMessage } from "./commandErrorMessage";

const FALLBACK = "Could not make the image. Try again.";

describe("commandErrorMessage", () => {
  it("never shows a raw JSON body", () => {
    const error = {
      status: 401,
      error_type: "unauthorized",
      error_message: '{"success":false,"error_code":401}',
    };
    expect(commandErrorMessage(error, FALLBACK)).toBe(FALLBACK);
  });

  it("never shows a JSON array or a JSON string error", () => {
    expect(commandErrorMessage({ error_message: '[{"code":1}]' }, FALLBACK)).toBe(FALLBACK);
    expect(commandErrorMessage('  {"error":"bad"}', FALLBACK)).toBe(FALLBACK);
    expect(commandErrorMessage({ message: '{"a":1}' }, FALLBACK)).toBe(FALLBACK);
    expect(
      commandErrorMessage({ error_details: { error_message: '{"a":1}' } }, FALLBACK),
    ).toBe(FALLBACK);
  });

  it("shows a plain sentence from Rust", () => {
    const error = {
      status: "bad_request",
      error_type: "needs_publik_setup",
      error_message: "Set up AI first. Click Set up AI.",
    };
    expect(commandErrorMessage(error, FALLBACK)).toBe("Set up AI first. Click Set up AI.");
    expect(commandErrorMessage("Type a prompt first.", FALLBACK)).toBe("Type a prompt first.");
  });

  it("falls back when the message is missing or empty", () => {
    expect(commandErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(commandErrorMessage({ status: "server_error" }, FALLBACK)).toBe(FALLBACK);
    expect(commandErrorMessage({ error_message: "   " }, FALLBACK)).toBe(FALLBACK);
    expect(commandErrorMessage(42, FALLBACK)).toBe(FALLBACK);
  });
});
