"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  questionId: string;
  adminSecret: string;
}

export function ModerationActions({ questionId, adminSecret }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "restore" | "remove") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/moderation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": adminSecret,
          },
          body: JSON.stringify({ question_id: questionId, action }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Action failed");
          return;
        }
        setDone(true);
        router.refresh();
      } catch {
        setError("Network error");
      }
    });
  }

  if (done) {
    return <span className="text-xs text-muted-foreground">✓ Done</span>;
  }

  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => handleAction("restore")}
        disabled={isPending}
        className="rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1.5 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
      >
        ✓ Restore
      </button>
      <button
        type="button"
        onClick={() => handleAction("remove")}
        disabled={isPending}
        className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
      >
        ✕ Remove
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
