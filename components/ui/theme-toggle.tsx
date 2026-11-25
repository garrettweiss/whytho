"use client";

import { Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const THEME_CHANGE_EVENT = "whytho:theme-change";

function subscribe(listener: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}

function lightModeEnabled() {
  return !document.documentElement.classList.contains("dark");
}

function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");

  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // The current page can still switch themes when browser storage is unavailable.
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeToggle({ placement }: { placement: "header" | "footer" }) {
  const light = useSyncExternalStore(subscribe, lightModeEnabled, () => false);

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${placement}`}
      aria-label="Light mode"
      aria-pressed={light}
      title={placement === "header" ? "Light mode" : undefined}
      onClick={toggleTheme}
    >
      <Sun size={18} aria-hidden="true" />
      {placement === "footer" && <span>Light mode</span>}
    </button>
  );
}
