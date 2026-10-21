import { vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@storyteller/soundboard", () => ({ SoundManager: {} }));
vi.mock("@storyteller/ui-toaster", () => ({ toast: { error: vi.fn() } }));

import { GenerationAction, GenerationServiceProvider } from "./common";
import { generationFailedMessage } from "./useGenerationFailedEvent";
import { generationEnqueueFailureMessage } from "./useGenerationEnqueueFailureEvent";

const base = { service: GenerationServiceProvider.Fal };

describe("generation failure messages", () => {
  it("shows Rust's sentence when it is plain text", () => {
    expect(
      generationFailedMessage({
        ...base,
        action: GenerationAction.GenerateImage,
        reason: "Your publik balance is empty. Add funds and try again.",
      }),
    ).toBe("Your publik balance is empty. Add funds and try again.");
  });

  it("never shows raw JSON", () => {
    expect(
      generationFailedMessage({
        ...base,
        action: GenerationAction.GenerateImage,
        reason: '{"error":{"code":"insufficient_funds"}}',
      }),
    ).toBe("Could not make the image. Try again.");
    expect(
      generationEnqueueFailureMessage({
        ...base,
        action: GenerationAction.GenerateAudio,
        reason: "[1,2]",
      }),
    ).toBe("Could not start the audio. Try again.");
  });

  it("falls back to one sentence for each action", () => {
    expect(
      generationFailedMessage({ ...base, action: GenerationAction.GenerateAudio }),
    ).toBe("Could not make the audio. Try again.");
    expect(
      generationEnqueueFailureMessage({
        ...base,
        action: GenerationAction.GenerateImage,
      }),
    ).toBe("Could not start the image. Try again.");
    expect(
      generationEnqueueFailureMessage({
        ...base,
        action: GenerationAction.GenerateVideo,
      }),
    ).toBe("Could not start the request. Try again.");
  });
});
