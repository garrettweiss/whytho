"use client";

import { useEffect, useState } from "react";

export type ViewMode = "politician" | "citizen";

const COOKIE_KEY = "whytho-view-mode";

function readCookie(): ViewMode | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)whytho-view-mode=([^;]*)/);
  return (match?.[1] as ViewMode) ?? null;
}

function writeCookie(mode: ViewMode) {
  // 30-day expiry, path=/, SameSite=Lax
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_KEY}=${mode}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Reads and persists the user's view mode (politician vs citizen).
 * Only meaningful for users who are actually on a politician team.
 * Defaults to "politician" on first use.
 */
export function useViewMode(isPolitician: boolean | null) {
  const [mode, setModeState] = useState<ViewMode>("politician");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readCookie();
    if (stored) {
      setModeState(stored);
    } else if (isPolitician) {
      // First time: default to politician mode and persist it
      writeCookie("politician");
      setModeState("politician");
    }
    setReady(true);
  }, [isPolitician]);

  function setMode(next: ViewMode) {
    writeCookie(next);
    setModeState(next);
  }

  function toggle() {
    setMode(mode === "politician" ? "citizen" : "politician");
  }

  return { mode, setMode, toggle, ready };
}
