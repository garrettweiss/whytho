"use client";

import { useState, useTransition } from "react";

export function DisputeClientButton({ answerId }: { answerId: string }) {
  const [disputed, setDisputed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDispute() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/answers/dispute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer_id: answerId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to submit dispute. Please try again.");
          return;
        }
        setDisputed(true);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (disputed) {
    return (
      <p className="text-xs text-orange-600 font-medium">⚠️ Disputed — flagged for admin review within 48h</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleDispute}
        disabled={isPending}
        className="self-start text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors disabled:opacity-50"
      >
        {isPending ? "Submitting…" : "Dispute this analysis"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
