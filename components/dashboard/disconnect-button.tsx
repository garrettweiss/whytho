"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import styles from "./dashboard.module.css";

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
      <div role="group" aria-label="Confirm profile removal" className={styles.confirmation}>
        <div className="space-y-1">
          <p className={styles.draftBody}>Remove {politicianName} from your dashboard?</p>
          <p className={styles.meta}>
            This will remove your access to this politician&apos;s dashboard.
            {isOnlyAdmin && (
              <> Since you are the only admin, the profile will return to <strong>Unclaimed</strong> status and all team members will lose access.</>
            )}
          </p>
        </div>
        {error && <p role="alert" className={`${styles.meta} ${styles.error}`}>{error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isPending}
            className={styles.dangerButton}
          >
            {isPending ? "Removing…" : "Yes, remove profile"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className={styles.secondaryButton}
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
      className={styles.textButton}
    >
      Remove this profile from my dashboard
    </button>
  );
}
