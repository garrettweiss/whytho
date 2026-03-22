"use client";

import { useState, useTransition } from "react";

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
    return <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ Published</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleApprove}
        disabled={isPending}
        className="self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Approving…" : "Approve and Publish"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
