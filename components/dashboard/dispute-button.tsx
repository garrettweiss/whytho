"use client";

import { useState, useTransition } from "react";

import styles from "./dashboard.module.css";

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
      <p role="status" className={`${styles.meta} ${styles.warning}`}>Disputed. Flagged for admin review within 48 hours.</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleDispute}
        disabled={isPending}
        className={styles.textButton}
      >
        {isPending ? "Submitting…" : "Dispute this analysis"}
      </button>
      {error && <p role="alert" className={`${styles.meta} ${styles.error}`}>{error}</p>}
    </div>
  );
}
