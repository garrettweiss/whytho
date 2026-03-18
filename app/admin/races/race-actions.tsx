"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  secret: string;
  raceId: string;
  // Candidate mode
  candidateId?: string;
  candidateName?: string;
  currentStatus?: string;
  // Race mode
  raceName?: string;
  markRaceComplete?: boolean;
}

export function RaceActions({
  secret,
  raceId,
  candidateId,
  candidateName,
  currentStatus,
  raceName,
  markRaceComplete,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateCandidateStatus(newStatus: string) {
    if (!candidateId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/races/candidate-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, candidateId, raceId, status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error ?? res.statusText}`);
      } else {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function completeRace() {
    if (!confirm(`Mark "${raceName}" as completed? This will hide all losing candidates.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/races/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, raceId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error ?? res.statusText}`);
      } else {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (markRaceComplete) {
    return (
      <button
        onClick={completeRace}
        disabled={loading}
        className="mt-1 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1 transition-colors hover:bg-muted disabled:opacity-50"
      >
        {loading ? "..." : "Mark race complete"}
      </button>
    );
  }

  if (!candidateId) return null;

  const isWon = currentStatus === "won";
  const isLost = currentStatus === "lost";

  return (
    <div className="flex gap-1 shrink-0">
      {!isWon && (
        <button
          onClick={() => updateCandidateStatus("won")}
          disabled={loading}
          className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
          title={`Mark ${candidateName} as won`}
        >
          Won
        </button>
      )}
      {!isLost && (
        <button
          onClick={() => updateCandidateStatus("lost")}
          disabled={loading}
          className="text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 border rounded px-2 py-0.5 transition-colors disabled:opacity-50"
          title={`Mark ${candidateName} as lost`}
        >
          Lost
        </button>
      )}
      {(isWon || isLost) && (
        <button
          onClick={() => updateCandidateStatus("active")}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 transition-colors disabled:opacity-50"
          title="Reset to active"
        >
          Reset
        </button>
      )}
    </div>
  );
}
