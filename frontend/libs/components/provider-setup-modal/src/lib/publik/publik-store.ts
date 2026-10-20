import { create } from "zustand";
import { PublikGetStatus, type PublikStatus } from "@storyteller/tauri-api";

/** Where the setup flow starts when it opens. */
export type PublikSetupEntry = "pick" | "card" | "own_key";

interface PublikStore {
  /** The last status from Rust. Undefined until the first load. */
  status?: PublikStatus;
  /** The setup modal (first-run card, prompt box, login screen). */
  isSetupOpen: boolean;
  setupEntry: PublikSetupEntry;
  setStatus: (status: PublikStatus) => void;
  refresh: () => Promise<PublikStatus | undefined>;
  openSetup: (entry?: PublikSetupEntry) => void;
  closeSetup: () => void;
}

export const usePublikStore = create<PublikStore>((set) => ({
  status: undefined,
  isSetupOpen: false,
  setupEntry: "pick",
  setStatus: (status) => set({ status }),
  refresh: async () => {
    try {
      const status = await PublikGetStatus();
      set({ status });
      return status;
    } catch (error) {
      console.error("publik: could not read the AI status", error);
      return undefined;
    }
  },
  openSetup: (entry = "pick") => set({ isSetupOpen: true, setupEntry: entry }),
  closeSetup: () => set({ isSetupOpen: false }),
}));
