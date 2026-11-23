"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface FeedbackActionsProps {
  feedbackId: string;
  adminSecret: string;
  isMayorSuggestion: boolean;
  isReviewed: boolean;
}

export function FeedbackActions({ feedbackId, adminSecret, isMayorSuggestion, isReviewed }: FeedbackActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [governmentEmailDomain, setGovernmentEmailDomain] = useState("");
  const [error, setError] = useState("");

  async function updateStatus(status: "reviewed" | "actioned" | "dismissed" | "approve_mayor") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: feedbackId,
          status,
          secret: adminSecret,
          ...(status === "approve_mayor" && governmentEmailDomain.trim() ? { government_email_domain: governmentEmailDomain } : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? "Feedback could not be updated.");
        return;
      }
      router.refresh();
    } catch {
      setError("Feedback could not be updated. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {isMayorSuggestion && <label className="flex basis-full items-center gap-2 text-sm">
        <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} disabled={loading} />
        I confirmed the current mayor on the official city site.
      </label>}
      {isMayorSuggestion && <label className="flex basis-full flex-wrap items-center gap-2 text-sm">
        <span>Official .gov email domain, if independently confirmed</span>
        <input type="text" className="rounded border bg-background px-2 py-1" value={governmentEmailDomain}
          onChange={(event) => setGovernmentEmailDomain(event.target.value)} maxLength={253} disabled={loading} />
      </label>}
      {!isReviewed && <button
        onClick={() => updateStatus("reviewed")}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-50"
      >
        Mark Reviewed
      </button>}
      <button
        onClick={() => updateStatus(isMayorSuggestion ? "approve_mayor" : "actioned")}
        disabled={loading || (isMayorSuggestion && !verified)}
        className="text-xs px-3 py-1.5 rounded-lg border border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors disabled:opacity-50"
      >
        {isMayorSuggestion ? "Approve and publish" : "Mark Actioned"}
      </button>
      <button
        onClick={() => updateStatus("dismissed")}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        Dismiss
      </button>
      {error && <p role="alert" className="basis-full text-sm text-destructive">{error}</p>}
    </>
  );
}
