import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PublikStatus } from "@storyteller/tauri-api";
import { usePublikStore } from "@storyteller/provider-setup-modal";
import { PublikResultBar } from "./PublikResultBar";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const BASE: PublikStatus = {
  provider: "publik",
  status_line: "publik API · $0.96 of publik balance",
  balance_line: "$0.96 of publik balance",
  cost_sentence: "The model's provider charges per use.",
  claimed: false,
  maybe_account_link: null,
  dashboard_url: "https://publikhq.com/dashboard/api",
  can_provision: true,
  wants_first_run: false,
  owes_first_card: false,
  supports_images: true,
  last_charge: "Charged $0.04 · $0.96 left",
  maybe_notice: null,
  texts: {
    disclosure: "",
    disclosure_data: "",
    terms_url: "https://publikhq.com/terms#api",
    sign_in: "Sign in with publik",
    add_plan: "Add a plan or pack",
    later: "Later",
  },
};

const WITH_NOTICE: PublikStatus = {
  ...BASE,
  maybe_notice: {
    message: "Not enough publik API balance for this request.",
    maybe_link: { label: "Sign in with publik", url: "https://publikhq.com/claim/AB12" },
  },
};

beforeEach(() => {
  mocks.invoke.mockImplementation(async (command: string) => ({
    status: "success",
    payload: command === "publik_dismiss_notice_command" ? BASE : usePublikStore.getState().status,
  }));
});

afterEach(() => {
  cleanup();
  mocks.invoke.mockReset();
});

it("shows the charge line after a call", async () => {
  usePublikStore.setState({ status: BASE });
  await act(async () => {
    render(<PublikResultBar />);
  });
  expect(screen.getByText("Charged $0.04 · $0.96 left")).toBeTruthy();
});

it("shows a 402 notice with exactly one link, and Dismiss clears it", async () => {
  usePublikStore.setState({ status: WITH_NOTICE });
  await act(async () => {
    render(<PublikResultBar />);
  });
  expect(screen.getByText("Not enough publik API balance for this request.")).toBeTruthy();
  const links = screen.getAllByRole("button", { name: "Sign in with publik" });
  expect(links).toHaveLength(1);

  await act(async () => {
    fireEvent.click(links[0]);
  });
  expect(mocks.invoke).toHaveBeenCalledWith("plugin:opener|open_url", {
    url: "https://publikhq.com/claim/AB12",
  });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  });
  expect(screen.queryByText("Not enough publik API balance for this request.")).toBeNull();
});
