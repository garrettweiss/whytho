"use client";

import { useState, useTransition } from "react";

import styles from "./dashboard.module.css";

interface Props {
  answerId: string;
  onApproved?: () => void;
}

export function DraftApproveButton({ answerId, onApproved }: Props) {
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/answers/${answerId}/approve`, {
          method: "POST",
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to approve. Please try again.");
          return;
        }
        setApproved(true);
        onApproved?.();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (approved) {
    return <span role="status" className={`${styles.meta} ${styles.success}`}>✓ Published</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleApprove}
        disabled={isPending}
        className={styles.button}
      >
        {isPending ? "Approving…" : "Approve and Publish"}
      </button>
      {error && <p role="alert" className={`${styles.meta} ${styles.error}`}>{error}</p>}
    </div>
  );
}
