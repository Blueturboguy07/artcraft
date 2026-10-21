import { create } from "zustand";

// The pages publik's build shows. Video, 3D, VFX, background tools, angles, watermark
// removers and the frame extractor have no tab: publik API cannot serve them.
export const TAB_IDS = [
  "IMAGE",
  "2D",
  "AUDIO",
  "STORYBOARD",
  "MOODBOARD",
  "APPS",
] as const;

export type TabId = (typeof TAB_IDS)[number];

export const isTabId = (value: unknown): value is TabId =>
  typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);

// The app opens on the Image page.
const DEFAULT_TAB: TabId = "IMAGE";

interface TabState {
  // Current active tab
  activeTabId: TabId;
  // Tab data stored as stringified JSON
  tabData: {
    [K in TabId]?: string;
  };
  // Actions
  setActiveTab: (tabId: TabId) => Promise<boolean>;
  updateTabData: (tabId: TabId, data: unknown) => void;
  getTabData: <T>(tabId: TabId) => T | null;
  clearTabData: (tabId: TabId) => void;
}

export const useTabStore = create<TabState>((set, get) => ({
  activeTabId: DEFAULT_TAB,
  tabData: {},

  setActiveTab: async (newTabId) => {
    // A page without a tab (an old link or saved state) does nothing.
    if (!isTabId(newTabId)) return false;
    // Don't do anything if we're already on this tab
    if (get().activeTabId === newTabId) return true;

    // The drawing store outlives its React page. Keep its live image objects,
    // selection, and undo history when switching tabs. Export/import is for
    // files; round-tripping here reread every image and rebuilt the scene.
    set({ activeTabId: newTabId });
    return true;
  },

  updateTabData: (tabId, data) => {
    set((state) => ({
      tabData: {
        ...state.tabData,
        [tabId]: JSON.stringify(data),
      },
    }));
  },

  getTabData: <T>(tabId: TabId): T | null => {
    const state = get();
    const data = state.tabData[tabId];
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch (e) {
      console.error(`Error parsing tab data for ${tabId}:`, e);
      return null;
    }
  },

  clearTabData: (tabId) => {
    set((state) => {
      const newTabData = { ...state.tabData };
      delete newTabData[tabId];
      return { tabData: newTabData };
    });
  },
}));
