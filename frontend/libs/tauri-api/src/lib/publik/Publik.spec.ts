import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  PublikImportImage,
  PublikListResults,
  PublikSpeech,
  PublikTranscribe,
  bytesToBase64,
  publikImportImageRequest,
} from "./Publik";
import { DownloadMediaFile } from "../download/DownloadMediaFile";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue({ status: "success", payload: {} });
});

const success = (payload: unknown) => ({ status: "success", payload });

describe("publik local media wrappers", () => {
  it("imports an image as base64 with its file name and returns the payload", async () => {
    const imported = { token: "publik_import_1", url: "asset://localhost/a.png", width: 2, height: 3 };
    vi.mocked(invoke).mockResolvedValueOnce(success(imported));
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
    const file = new File([bytes], "photo.png", { type: "image/png" });

    const result = await PublikImportImage(file);

    expect(result).toEqual(imported);
    expect(invoke).toHaveBeenCalledWith("publik_import_image_command", {
      request: { base64: "iVBORwD/", file_name: "photo.png" },
    });
    const sent = vi.mocked(invoke).mock.calls[0][1] as { request: { base64: string } };
    expect(sent.request.base64.startsWith("data:")).toBe(false);
  });

  it("uses the given file name, and a default for a plain blob", async () => {
    await PublikImportImage(new Blob([new Uint8Array([1])]), "canvas.png");
    await PublikImportImage(new Blob([new Uint8Array([1])]));
    expect(invoke).toHaveBeenNthCalledWith(1, "publik_import_image_command", {
      request: { base64: "AQ==", file_name: "canvas.png" },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "publik_import_image_command", {
      request: { base64: "AQ==", file_name: "image.png" },
    });
  });

  it("builds the import request in one place", () => {
    expect(publikImportImageRequest(new Uint8Array([1, 2, 3]), "a.png")).toEqual({
      base64: "AQID",
      file_name: "a.png",
    });
  });

  it("lists results with and without a limit", async () => {
    const results = [
      {
        task_id: "t2",
        created_at: "2026-10-21T10:00:00Z",
        model: "speech",
        prompt: "Hello",
        images: [],
        audio: { token: "publik_t2_0", url: "asset://localhost/t2.mp3" },
      },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(success(results));

    expect(await PublikListResults()).toEqual(results);
    await PublikListResults(20);

    expect(invoke).toHaveBeenNthCalledWith(1, "publik_list_results_command", {
      request: {},
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "publik_list_results_command", {
      request: { limit: 20 },
    });
  });

  it("sends speech text and voice", async () => {
    const speech = { token: "publik_s_0", url: "asset://localhost/s.mp3", charge_line: "Charged $0.01." };
    vi.mocked(invoke).mockResolvedValueOnce(success(speech));
    expect(await PublikSpeech("Hello there", "nova")).toEqual(speech);
    expect(invoke).toHaveBeenCalledWith("publik_speech_command", {
      request: { text: "Hello there", voice: "nova" },
    });
  });

  it("sends the transcription path, with the language only when set", async () => {
    await PublikTranscribe("/Users/me/a.mp3");
    await PublikTranscribe("/Users/me/a.mp3", "en");
    expect(invoke).toHaveBeenNthCalledWith(1, "publik_transcribe_command", {
      request: { path: "/Users/me/a.mp3" },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "publik_transcribe_command", {
      request: { path: "/Users/me/a.mp3", language: "en" },
    });
  });

  it("downloads a stored result by its local token", async () => {
    await DownloadMediaFile("publik_task_0");
    expect(invoke).toHaveBeenCalledWith("download_media_file_command", {
      request: { media_token: "publik_task_0" },
    });
  });

  it("passes a command error through unchanged", async () => {
    const error = { status: "bad_request", error_type: "needs_publik_setup", error_message: "Set up AI first." };
    vi.mocked(invoke).mockRejectedValueOnce(error);
    await expect(PublikSpeech("Hi", "alloy")).rejects.toBe(error);
  });
});

describe("bytesToBase64", () => {
  it("round-trips a buffer larger than 64 KB", () => {
    const bytes = new Uint8Array(70_000 + 3);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256;

    const encoded = bytesToBase64(bytes);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

    expect(decoded).toEqual(bytes);
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
  });
});
