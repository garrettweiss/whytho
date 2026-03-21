"use client";

import { useState } from "react";

interface Props {
  postId: string;
  adminSecret: string;
  showRestore?: boolean;
}

export function XQueueActions({ postId, adminSecret, showRestore = false }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [action, setAction] = useState<"approved" | "rejected" | null>(null);

  async function handleAction(newStatus: "approved" | "rejected") {
    setStatus("loading");
    setAction(newStatus);

    try {
      const res = await fetch("/api/admin/x-queue", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ postId, status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Request failed");
      }

      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setAction(null);
    }
  }

  if (status === "done") {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        {action === "approved" ? "✅ Approved" : "❌ Rejected"}. Refresh to update queue
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="text-xs text-destructive font-medium">
        Error. Try again
      </span>
    );
  }

  const isLoading = status === "loading";

  if (showRestore) {
    return (
      <button
        onClick={() => handleAction("approved")}
        disabled={isLoading}
        className="px-3 py-1 rounded-lg text-xs font-medium border border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
      >
        {isLoading ? "..." : "Restore → Approve"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleAction("rejected")}
        disabled={isLoading}
        className="px-3 py-1 rounded-lg text-xs font-medium border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50"
      >
        {isLoading && action === "rejected" ? "..." : "Reject"}
      </button>
      <button
        onClick={() => handleAction("approved")}
        disabled={isLoading}
        className="px-3 py-1 rounded-lg text-xs font-medium border border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
      >
        {isLoading && action === "approved" ? "..." : "Approve"}
      </button>
    </div>
  );
}
