"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface FeedbackActionsProps {
  feedbackId: string;
  adminSecret: string;
}

export function FeedbackActions({ feedbackId, adminSecret }: FeedbackActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateStatus(status: "reviewed" | "actioned" | "dismissed") {
    setLoading(true);
    await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: feedbackId, status, secret: adminSecret }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => updateStatus("reviewed")}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-50"
      >
        Mark Reviewed
      </button>
      <button
        onClick={() => updateStatus("actioned")}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg border border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors disabled:opacity-50"
      >
        Mark Actioned
      </button>
      <button
        onClick={() => updateStatus("dismissed")}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        Dismiss
      </button>
    </>
  );
}
