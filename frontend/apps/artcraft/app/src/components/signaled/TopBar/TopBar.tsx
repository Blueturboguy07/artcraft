import { ChevronRightIcon, HouseIcon, ImagesIcon, MinusIcon, PictureInPicture2Icon, SettingsIcon, SquareIcon, XIcon } from "lucide-react";
import { DynamicIcon } from "@storyteller/icons";
import { signal } from "@preact/signals-react";
import { useSignals } from "@preact/signals-react/runtime";
import {
  useTauriPlatform,
  useTauriWindowControls,
} from "@storyteller/tauri-utils";
import { Button } from "@storyteller/ui-button";
import {
  GalleryModal,
  galleryModalLightboxVisible,
  galleryModalVisibleDuringDrag,
  galleryModalVisibleViewMode,
} from "@storyteller/ui-gallery-modal";
import {
  MenuIconItem,
  MenuIconSelector,
} from "@storyteller/ui-menu-icon-selector";
import { GallerySelectToggle, GalleryViewToggle } from "@storyteller/ui-generation-list";
import { SettingsModal } from "@storyteller/ui-settings-modal";
import { Tooltip } from "@storyteller/ui-tooltip";
import { Fragment, useRef, useState } from "react";
import { APP_DESCRIPTORS, goToApp } from "~/config/appMenu";
import { useStoryboardStore } from "~/pages/PageStoryboard";
import { useSceneStore } from "@storyteller/ui-pagedraw";
import { TabId, useTabStore } from "~/pages/Stores/TabState";
import type { BaseSelectorImage } from "@storyteller/ui-pagedraw";
import {
  applyRecreateFromPrompt,
  applyUseAsReference,
} from "~/components/generation-feed/desktopMediaActions";
import { AppsQuickMenu } from "./AppsQuickMenu";
import { TaskQueue } from "./TaskQueue";

interface Props {
  pageName: string;
}

// Settings section type to match the SettingsModal component
type SettingsSection = "general" | "accounts" | "alerts" | "about";

const SWITCHER_THROTTLE_TIME = 500; // milliseconds

// NB: See `TabState` for the default tab (Image). Home lists every app.
const appMenuTabs: MenuIconItem[] = [
  {
    id: "APPS",
    label: "Home",
    icon: <HouseIcon />,
    description: "See all apps",
    large: true,
    tooltipContent: <AppsQuickMenu />,
    tooltipInteractive: true,
    tooltipPosition: "bottom",
  },
  ...APP_DESCRIPTORS.map((d) => ({
    id: d.id,
    label: d.label,
    icon: <DynamicIcon icon={d.icon} />,
    imageSrc: d.imageSrc,
    description: d.description,
    large: d.large,
  })),
];

export const topNavMediaId = signal<string>("");
export const topNavMediaUrl = signal<string>("");

const PAGE_CRUMBS: Record<TabId, string[]> = {
  IMAGE: ["Create", "Image"],
  AUDIO: ["Create", "Audio"],
  "2D": ["Studio", "Image Editor"],
  STORYBOARD: ["Create", "Storyboard"],
  MOODBOARD: ["Studio", "Moodboard"],
  APPS: ["Home"],
};

export const TopBar = (_props: Props) => {
  useSignals();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");

  const { isDesktop, isMaximized, minimize, toggleMaximize, close } =
    useTauriWindowControls();
  const platform = useTauriPlatform();

  const tabStore = useTabStore();
  const [disableSwitcher, setDisableSwitcher] = useState(false);
  const switcherThrottle = useRef(false);

  const handleOpenGalleryModal = () => {
    galleryModalVisibleViewMode.value = true;
    galleryModalVisibleDuringDrag.value = true;
  };

  const handleEditFromGallery = async (url: string, mediaId?: string) => {
    try {
      // Reset editor state
      useSceneStore.getState().RESET();

      // Switch to the image editor
      useTabStore.getState().setActiveTab("2D");

      // Select the image for editing
      const baseImage: BaseSelectorImage = {
        url,
        mediaToken: mediaId || "",
      };

      // Add it to state history
      useSceneStore.getState().addHistoryImageBundle({ images: [baseImage] });
      useSceneStore.getState().setBaseImageInfo(baseImage);

      // Close gallery modal and lightbox if open
      galleryModalVisibleViewMode.value = false;
      galleryModalVisibleDuringDrag.value = false;
      galleryModalLightboxVisible.value = false;
    } catch (e) {
      // no-op
    }
  };

  const pageCrumbs = PAGE_CRUMBS[tabStore.activeTabId] ?? ["Home"];

  return (
    <>
      <header
        className="fixed left-0 top-0 z-[60] w-full border-b border-ui-border bg-ui-panel"
        data-tauri-drag-region
      >
        <nav
          className="mx-auto grid h-[56px] w-screen grid-cols-3 items-center justify-between ps-3"
          aria-label="navigation"
          data-tauri-drag-region
        >
          <div
            className={`flex items-center gap-3 ${platform === "macos" ? "ml-14" : ""}`}
            data-tauri-drag-region
          >
            <MenuIconSelector
              menuItems={appMenuTabs}
              activeMenu={tabStore.activeTabId}
              disabled={disableSwitcher}
              onMenuChange={(tabId) => {
                // Prevent a second input if the switcher is throttled.
                if (switcherThrottle.current) {
                  return;
                }
                switcherThrottle.current = true;
                setDisableSwitcher(true);

                useTabStore.getState().setActiveTab(tabId as TabId);
                setTimeout(() => {
                  // Clear the throttle
                  switcherThrottle.current = false;
                  // Trigger a new re-render (important)
                  setDisableSwitcher(false);
                }, SWITCHER_THROTTLE_TIME);
              }}
              className="no-drag w-fit"
            />
          </div>

          <div
            className="flex min-w-0 items-center justify-center gap-2 font-medium"
            data-tauri-drag-region
          >
            <h1
              className="hud-label flex min-w-0 items-center gap-1.5 text-base-fg/70"
              data-tauri-drag-region
            >
              {pageCrumbs.map((crumb, i) => {
                const isLast = i === pageCrumbs.length - 1;
                return (
                  <Fragment key={`${crumb}-${i}`}>
                    {i > 0 && (
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 text-base-fg/50"
                        data-tauri-drag-region
                      />
                    )}
                    <span
                      className={
                        isLast
                          ? "truncate bg-ui-ink px-1.5 py-1 text-ui-panel"
                          : "truncate"
                      }
                      aria-current={isLast ? "page" : undefined}
                      data-tauri-drag-region
                    >
                      {crumb}
                    </span>
                  </Fragment>
                );
              })}
            </h1>
          </div>

          <div className="flex justify-end gap-2" data-tauri-drag-region>
            <div className="no-drag flex items-center gap-1.5 sm:gap-2">
              {tabStore.activeTabId === "IMAGE" && <GallerySelectToggle />}
              {tabStore.activeTabId === "IMAGE" && <GalleryViewToggle />}

              <TaskQueue />

              <button
                type="button"
                onClick={handleOpenGalleryModal}
                aria-label="My Library"
                className="flex h-8 items-center gap-1.5 rounded-[3px] border border-white/15 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 transition-colors hover:border-white/30 hover:bg-white/10"
              >
                <ImagesIcon className="text-[11px]" />
                <span className="hidden whitespace-nowrap xl:block">
                  My Library
                </span>
              </button>

              <Tooltip content="Settings" position="bottom" delay={300}>
                <Button
                  aria-label="Settings"
                  variant="secondary"
                  icon={SettingsIcon}
                  iconClassName="h-4 w-4 shrink-0"
                  className="h-8 w-8 border-white/15 bg-transparent p-0 text-white/80 hover:border-white/30 hover:bg-white/10"
                  onClick={() => {
                    setSettingsSection("general");
                    setIsSettingsModalOpen(true);
                  }}
                />
              </Tooltip>
            </div>

            {isDesktop && platform !== "macos" && (
              <div className="no-drag flex items-center">
                <Button
                  variant="secondary"
                  className="h-[32px] w-[44px] rounded-none border-0 bg-transparent p-0 text-base-fg opacity-70 shadow-none hover:bg-white/10 hover:opacity-100"
                  onClick={minimize}
                >
                  <MinusIcon className="text-xs" />
                </Button>
                <Button
                  variant="secondary"
                  className="h-[32px] w-[44px] rounded-none border-0 bg-transparent p-0 text-base-fg opacity-70 shadow-none hover:bg-white/10 hover:opacity-100"
                  onClick={toggleMaximize}
                >
                  <DynamicIcon
                    icon={isMaximized ? PictureInPicture2Icon : SquareIcon}
                    className="text-xs"
                  />
                </Button>
                <Button
                  variant="secondary"
                  className="h-[32px] w-[44px] rounded-none border-0 bg-transparent p-0 text-base-fg opacity-70 shadow-none hover:bg-red hover:text-white hover:opacity-100"
                  onClick={close}
                >
                  <XIcon className="text-lg" />
                </Button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onStoryboardPageDisable={() => {
          useStoryboardStore.getState().reset();
          goToApp("IMAGE");
        }}
        initialSection={settingsSection}
      />

      <GalleryModal
        mode="view"
        onEditClicked={handleEditFromGallery}
        onUseAsReferenceClicked={applyUseAsReference}
        onReusePromptClicked={applyRecreateFromPrompt}
      />
    </>
  );
};
