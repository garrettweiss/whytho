"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ForwardedAnswerFormProps {
  itemId: string;
  adminSecret: string;
}

export function ForwardedAnswerForm({ itemId, adminSecret }: ForwardedAnswerFormProps) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [publish, setPublish] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/forwarded", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: itemId,
        team_answer: answer.trim(),
        published: publish,
        secret: adminSecret,
      }),
    });

    if (!res.ok) {
      setError("Failed to save answer. Please try again.");
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Write the answer to this question..."
        rows={3}
        className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="rounded"
          />
          Publish to knowledge base
        </label>
        <button
          type="submit"
          disabled={loading || !answer.trim()}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Saving..." : "Save Answer"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
