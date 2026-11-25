"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { TERMS_VERSION } from "@/lib/auth/participation";
import { useUser } from "@/lib/auth/use-user";

type Status = "checking" | "required" | "saving" | "accepted" | "unavailable";
type Confirmation = { accountId: string; status: Status; saveError?: string };
type Participation = ReturnType<typeof useUser> & {
  status: Status;
  saveError?: string;
  retry: () => void;
  requireConfirmation: () => void;
  confirm: () => Promise<void>;
};

const ParticipationContext = createContext<Participation | null>(null);

export function ParticipationProvider({ children }: { children: ReactNode }) {
  const auth = useUser();
  const accountId = auth.user?.is_anonymous ? undefined : auth.user?.id;
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [attempt, setAttempt] = useState(0);
  const current = confirmation?.accountId === accountId ? confirmation : undefined;
  const status = current?.status ?? "checking";

  useEffect(() => {
    if (!accountId) return;
    const checkedAccount = accountId;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch("/api/participation", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || data.account_required || typeof data.accepted !== "boolean") throw new Error();
        if (!controller.signal.aborted) {
          setConfirmation({ accountId: checkedAccount, status: data.accepted ? "accepted" : "required" });
        }
      } catch {
        if (!controller.signal.aborted) setConfirmation({ accountId: checkedAccount, status: "unavailable" });
      }
    }
    void check();
    return () => controller.abort();
  }, [accountId, attempt]);

  async function confirm() {
    if (!accountId || status !== "required") return;
    setConfirmation({ accountId, status: "saving" });
    try {
      const response = await fetch("/api/participation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adult: true, terms_version: TERMS_VERSION }),
      });
      if (!response.ok || (await response.json()).accepted !== true) throw new Error();
      setConfirmation((previous) => previous?.accountId === accountId ? { accountId, status: "accepted" } : previous);
    } catch {
      setConfirmation((previous) => previous?.accountId === accountId
        ? { accountId, status: "required", saveError: "We couldn’t save your confirmation. Please try again." }
        : previous);
    }
  }

  return <ParticipationContext.Provider value={{
    ...auth,
    status,
    saveError: current?.saveError,
    retry: () => {
      if (!accountId) return;
      setConfirmation({ accountId, status: "checking" });
      setAttempt((value) => value + 1);
    },
    requireConfirmation: () => {
      if (!accountId) return;
      setConfirmation((previous) => previous?.accountId === accountId ? { accountId, status: "required" } : previous);
    },
    confirm,
  }}>{children}</ParticipationContext.Provider>;
}

export function useParticipation() {
  const context = useContext(ParticipationContext);
  if (!context) throw new Error("ParticipationProvider is required");
  return context;
}
