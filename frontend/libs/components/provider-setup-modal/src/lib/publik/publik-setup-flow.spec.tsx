import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PublikStatus } from "@storyteller/tauri-api";
import { PublikSetupFlow } from "./publik-setup-flow";
import { usePublikStore } from "./publik-store";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

const TEXTS = {
  disclosure: "This app can use publik API for its AI features.",
  disclosure_data: "What you send goes through publik's servers.",
  terms_url: "https://publikhq.com/terms#api",
  sign_in: "Sign in with publik",
  add_plan: "Add a plan or pack",
  later: "Later",
};

const NOT_SET_UP: PublikStatus = {
  provider: "not_set_up",
  status_line: "AI is not set up",
  balance_line: "",
  cost_sentence: "The model's provider charges per use.",
  claimed: false,
  maybe_account_link: null,
  dashboard_url: "https://publikhq.com/dashboard/api",
  can_provision: true,
  wants_first_run: true,
  owes_first_card: false,
  supports_images: false,
  last_charge: "",
  maybe_notice: null,
  texts: TEXTS,
};

const LINKED: PublikStatus = {
  ...NOT_SET_UP,
  provider: "publik",
  status_line: "publik API · $0.00 · link this computer for $0.05 of free use",
  balance_line: "$0.00 · link this computer for $0.05 of free use",
  maybe_account_link: { label: "Sign in with publik", url: "https://publikhq.com/claim/AB12" },
  wants_first_run: false,
  owes_first_card: true,
  supports_images: true,
};

beforeEach(() => {
  usePublikStore.setState({ status: NOT_SET_UP, isSetupOpen: false, setupEntry: "pick" });
  mocks.invoke.mockImplementation(async (command: string) => {
    switch (command) {
      case "publik_link_computer_command":
        return { status: "success", payload: LINKED };
      case "publik_mark_first_card_shown_command":
        return { status: "success", payload: { ...LINKED, owes_first_card: false } };
      case "publik_close_setup_command":
        return { status: "success", payload: { ...NOT_SET_UP, wants_first_run: false } };
      case "publik_set_own_key_command":
        return {
          status: "success",
          payload: {
            check_line: "The key works: 3 models available. Using gpt-4.1-mini.",
            status: { ...NOT_SET_UP, provider: "own", wants_first_run: false },
          },
        };
      default:
        return { status: "success", payload: NOT_SET_UP };
    }
  });
});

afterEach(() => {
  cleanup();
  mocks.invoke.mockReset();
});

it("offers publik API and the own key, and Later closes the card for good", async () => {
  const onClose = vi.fn();
  render(<PublikSetupFlow onClose={onClose} />);
  expect(screen.getByRole("button", { name: "Use publik API" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Use my own key" })).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
  });
  expect(mocks.invoke).toHaveBeenCalledWith("publik_close_setup_command", undefined);
  expect(onClose).toHaveBeenCalled();
});

it("links this computer only after the disclosure, then shows the balance and one link", async () => {
  render(<PublikSetupFlow onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use publik API" }));
  expect(screen.getByText(TEXTS.disclosure)).toBeTruthy();
  expect(mocks.invoke).not.toHaveBeenCalledWith("publik_link_computer_command", undefined);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
  expect(mocks.invoke).toHaveBeenCalledWith("publik_link_computer_command", undefined);
  expect(screen.getByText("$0.00 · link this computer for $0.05 of free use")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Sign in with publik" })).toHaveLength(1);
  expect(mocks.invoke).toHaveBeenCalledWith("publik_mark_first_card_shown_command", undefined);
});

it("checks an own key through Rust and reports the result", async () => {
  render(<PublikSetupFlow onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my own key" }));
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-test" } });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Check and use this key" }));
  });
  expect(mocks.invoke).toHaveBeenCalledWith("publik_set_own_key_command", {
    request: { key: "sk-test", maybe_base_url: null, maybe_model: null },
  });
  expect(screen.getByText("The key works: 3 models available. Using gpt-4.1-mini.")).toBeTruthy();
  expect(usePublikStore.getState().status?.provider).toBe("own");
});
