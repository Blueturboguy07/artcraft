import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LightboxModal from "./lightbox-modal";

const URLS = ["asset://localhost/a.png", "asset://localhost/b.png"];
const TOKENS = ["publik_t1_0", "publik_t1_1"];

afterEach(cleanup);

describe("LightboxModal", () => {
  it("renders closed", () => {
    const { baseElement } = render(
      <LightboxModal isOpen={false} onClose={() => undefined} />,
    );
    expect(baseElement).toBeTruthy();
  });

  it("shows the prompt, the model and the batch", () => {
    render(
      <LightboxModal
        isOpen
        onClose={() => undefined}
        imageUrl={URLS[1]}
        imageUrls={URLS}
        mediaTokens={TOKENS}
        mediaId={TOKENS[1]}
        mediaClass="image"
        prompt="a red fox in snow"
        modelName="GPT Image 1"
        createdAt="2026-10-21T10:00:00Z"
      />,
    );

    expect(screen.getByText("a red fox in snow")).toBeTruthy();
    expect(screen.getByText("GPT Image 1")).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Image 1 of 2")).toBeTruthy();
  });

  it("downloads the selected image by its token", () => {
    const onDownload = vi.fn();
    render(
      <LightboxModal
        isOpen
        onClose={() => undefined}
        imageUrls={URLS}
        mediaTokens={TOKENS}
        mediaId={TOKENS[0]}
        mediaClass="image"
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByLabelText("Image 2 of 2"));
    fireEvent.click(screen.getByText("Download"));
    expect(onDownload).toHaveBeenCalledWith(TOKENS[1]);
  });

  it("asks for a second click before it deletes", () => {
    const onDelete = vi.fn(() => true);
    render(
      <LightboxModal
        isOpen
        onClose={() => undefined}
        imageUrl={URLS[0]}
        mediaId={TOKENS[0]}
        mediaClass="image"
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Click to delete"));
    expect(onDelete).toHaveBeenCalledWith(TOKENS[0]);
  });

  it("plays a speech clip and hides the image actions", () => {
    const { container } = render(
      <LightboxModal
        isOpen
        onClose={() => undefined}
        imageUrl="asset://localhost/t2_0.mp3"
        mediaId="publik_t2_0"
        mediaClass="audio"
        prompt="Hello."
        onEditClicked={() => undefined}
        onDownload={() => undefined}
      />,
    );

    expect(
      container.ownerDocument.querySelector('audio[src="asset://localhost/t2_0.mp3"]'),
    ).toBeTruthy();
    expect(screen.queryByText("Edit Image")).toBeNull();
    expect(screen.getByText("Download")).toBeTruthy();
  });
});
