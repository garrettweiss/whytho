"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  politicianId: string;
  politicianName: string;
  isOnlyAdmin: boolean;
}

export function DisconnectButton({ politicianId, politicianName, isOnlyAdmin }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/dashboard/disconnect", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ politician_id: politicianId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to disconnect. Please try again.");
          return;
        }
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (showConfirm) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Remove {politicianName} from your dashboard?</p>
          <p className="text-xs text-muted-foreground">
            This will remove your access to this politician&apos;s dashboard.
            {isOnlyAdmin && (
              <> Since you are the only admin, the profile will return to <strong>Unclaimed</strong> status and all team members will lose access.</>
            )}
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isPending}
            className="inline-flex items-center rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Removing…" : "Yes, remove profile"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors"
    >
      Remove this profile from my dashboard
    </button>
  );
}
