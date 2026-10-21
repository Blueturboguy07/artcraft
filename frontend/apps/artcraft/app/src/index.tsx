import { StrictMode, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { MainApp } from "./pages/MainApp";
import { createRoot } from "react-dom/client";
import "./styles/normalize.css";
import "./styles/tailwind.css";
import "./styles/base.css";
import { pageHeight, pageWidth } from "~/signals/global";
import { SoundManager } from "@storyteller/soundboard";

// publik's build: no account, no session probe, no telemetry and no model listing from a
// server on launch. The AI step is publik API (or the person's own key), set up through the
// publik setup card.

const GlobalSettingsManager = () => {
  // Apply stored theme early on mount
  useEffect(() => {
    const key = "st-theme";
    const value = (localStorage.getItem(key) || "gray").trim();
    const allowed = ["light", "gray", "black", "aurora", "sunset", "gradient"];
    const normalized = value === "gradient" ? "aurora" : value;
    const theme = allowed.includes(value) ? (normalized as string) : "gray";
    const root = document.documentElement;
    const toRemove: string[] = [];
    root.classList.forEach((c) => {
      if (c.startsWith("theme-")) toRemove.push(c);
    });
    toRemove.forEach((c) => root.classList.remove(c));
    root.classList.add(`theme-${theme}`);
  }, []);

  /// Initizations that run only once on 1ST mount ///
  function setPage() {
    // TODO address this issue with zooming
    pageHeight.value = window.innerHeight;
    pageWidth.value = window.innerWidth;
  }

  useEffect(() => {
    setPage();
    window.addEventListener("resize", setPage);
    return () => {
      window.removeEventListener("resize", setPage);
    };
  }, []);

  useEffect(() => {
    SoundManager.install();
  }, []);

  return null;
};

createRoot(document.getElementById("root")!).render(
  <>
    <StrictMode>
      <BrowserRouter>
        <GlobalSettingsManager />
        <div className="topbar-spacer" data-tauri-drag-region={true} />
        <MainApp />
      </BrowserRouter>
    </StrictMode>
  </>,
);
