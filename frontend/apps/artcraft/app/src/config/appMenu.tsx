import { AudioLinesIcon, GroupIcon, ImageIcon, ImagesIcon, PenToolIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import {
  useExperimentalStore,
  useStoryboardPageEnabled,
} from "@storyteller/ui-settings-modal";
import { useTabStore, TabId } from "~/pages/Stores/TabState";

// The apps publik's build shows. Each one maps to a publik API line (images: GPT Image 1
// and Nano Banana; speech; transcription) or works offline (storyboard, moodboard).
export type AppId = TabId & ("IMAGE" | "AUDIO" | "2D" | "STORYBOARD" | "MOODBOARD");

export interface AppDescriptor {
  id: AppId;
  label: string;
  icon: LucideIcon;
  imageSrc?: string;
  description?: string;
  large?: boolean;
}

export const APP_DESCRIPTORS: AppDescriptor[] = [
  {
    id: "IMAGE",
    label: "Create Image",
    icon: ImageIcon,
  },
  {
    id: "AUDIO",
    label: "Audio",
    icon: AudioLinesIcon,
  },
  {
    id: "2D",
    label: "Image Editor",
    icon: PenToolIcon,
    imageSrc: "/resources/gifs/2D_CANVAS_DEMO.webp",
    description: "Draw on an image, then let AI finish it.",
    large: true,
  },
];

export interface FullAppItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: "generate" | "edit";
  badge?: "NEW" | "BEST" | "SOON" | "BETA";
  action?: AppId;
  /** Legacy single-tone icon-square background (e.g. "bg-blue-600/40"). Still
   *  used as the fallback for the apps-page card styling. */
  color?: string;
}

// Per-app card palette for the Apps page (webapp-home-style cards). Derived
// from each app's Tailwind color family so the icon tile, its border, and the
// hover state all share a hue. Keyed by app id; falls back to a neutral tone
// when an id is missing.
interface AppCardPalette {
  /** Hover tint for the card, e.g. "from-blue-500/20 to-blue-500/0". Legacy. */
  accent: string;
  /** Icon tile background + border, e.g. "bg-blue-500/20 border-blue-400/40". */
  iconBg: string;
  /** Icon glyph color, e.g. "text-blue-300". */
  iconColor: string;
  /** Card hover border + background, e.g. "hover:border-blue-400/60 hover:bg-blue-500/10". */
  hoverStyle: string;
}

const APP_CARD_PALETTES: Record<string, AppCardPalette> = {
  "text-to-image": {
    accent: "from-blue-500/20 to-blue-500/0",
    iconBg: "bg-blue-500/20 border-blue-400/40",
    iconColor: "text-blue-300",
    hoverStyle: "hover:border-blue-400/60 hover:bg-blue-500/10",
  },
  "create-audio": {
    accent: "from-pink-500/20 to-pink-500/0",
    iconBg: "bg-pink-500/20 border-pink-400/40",
    iconColor: "text-pink-300",
    hoverStyle: "hover:border-pink-400/60 hover:bg-pink-500/10",
  },
  moodboard: {
    accent: "from-indigo-500/20 to-indigo-500/0",
    iconBg: "bg-indigo-500/20 border-indigo-400/40",
    iconColor: "text-indigo-300",
    hoverStyle: "hover:border-indigo-400/60 hover:bg-indigo-500/10",
  },
  "2d-canvas": {
    accent: "from-sky-500/20 to-sky-500/0",
    iconBg: "bg-sky-500/20 border-sky-400/40",
    iconColor: "text-sky-300",
    hoverStyle: "hover:border-sky-400/60 hover:bg-sky-500/10",
  },
  storyboard: {
    accent: "from-fuchsia-500/20 to-fuchsia-500/0",
    iconBg: "bg-fuchsia-500/20 border-fuchsia-400/40",
    iconColor: "text-fuchsia-300",
    hoverStyle: "hover:border-fuchsia-400/60 hover:bg-fuchsia-500/10",
  },
};

const FALLBACK_APP_CARD_PALETTE: AppCardPalette = {
  accent: "from-white/10 to-white/0",
  iconBg: "bg-ui-controls border-ui-controls-border",
  iconColor: "text-base-fg",
  hoverStyle: "hover:border-white/30 hover:bg-white/10",
};

export const getAppCardPalette = (id: string): AppCardPalette =>
  APP_CARD_PALETTES[id] ?? FALLBACK_APP_CARD_PALETTE;

export const ALL_APPS: FullAppItem[] = [
  {
    id: "text-to-image",
    label: "Create Image",
    description: "Make images from a prompt with GPT Image 1 or Nano Banana.",
    icon: ImageIcon,
    category: "generate",
    action: "IMAGE",
    color: "bg-blue-600/40",
  },
  {
    id: "create-audio",
    label: "Audio",
    description: "Turn text into speech, or audio into text.",
    icon: AudioLinesIcon,
    category: "generate",
    action: "AUDIO",
    color: "bg-pink-500/40",
  },
  {
    id: "storyboard",
    label: "Storyboard",
    description: "Plan your shots on a visual storyboard.",
    icon: ImagesIcon,
    category: "generate",
    action: "STORYBOARD",
    color: "bg-fuchsia-600/40",
  },
  {
    id: "moodboard",
    label: "Moodboard",
    description: "Collect references. Send them to Create Image.",
    icon: GroupIcon,
    category: "generate",
    action: "MOODBOARD",
    color: "bg-orange-500/40",
    badge: "BETA",
  },
  {
    id: "2d-canvas",
    label: "Image Editor",
    description: "Draw on an image, then let AI finish it.",
    icon: PenToolIcon,
    category: "edit",
    action: "2D",
    color: "bg-sky-500/40",
  },
];

export const GENERATE_APPS = ALL_APPS.filter(
  (app) => app.category === "generate",
);
export const EDIT_APPS = ALL_APPS.filter((app) => app.category === "edit");

export const useVisibleApps = (): FullAppItem[] => {
  const storyboardEnabled = useStoryboardPageEnabled();
  return useMemo(
    () =>
      ALL_APPS.filter((app) => {
        if (app.action === "STORYBOARD") return storyboardEnabled;
        return true;
      }),
    [storyboardEnabled],
  );
};

export const useGenerateApps = (): FullAppItem[] => {
  const visible = useVisibleApps();
  return useMemo(
    () => visible.filter((app) => app.category === "generate"),
    [visible],
  );
};

export const useEditApps = (): FullAppItem[] => {
  const visible = useVisibleApps();
  return useMemo(
    () => visible.filter((app) => app.category === "edit"),
    [visible],
  );
};

export const getBadgeStyles = (badge?: string) => {
  switch (badge) {
    case "NEW":
      return "border-purple-400/40 text-purple-300";
    case "BEST":
      return "border-primary/30 text-ui-accent-ink";
    case "SOON":
      return "border-white/20 text-base-fg/50";
    case "BETA":
      return "border-amber-400/40 text-amber-300";
    default:
      return "";
  }
};

const APP_IDS: readonly AppId[] = ["IMAGE", "AUDIO", "2D", "STORYBOARD", "MOODBOARD"];

export const goToApp = (action?: string) => {
  if (!action || !(APP_IDS as readonly string[]).includes(action)) return;
  if (action === "STORYBOARD") {
    const { enabled, storyboardPageEnabled } = useExperimentalStore.getState();
    if (!enabled || !storyboardPageEnabled) return;
  }
  useTabStore.getState().setActiveTab(action as TabId);
};
