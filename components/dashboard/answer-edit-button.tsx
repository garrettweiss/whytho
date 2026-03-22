"use client";

import { useState, useTransition } from "react";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Props {
  answerId: string;
  initialBody: string;
  createdAt: string; // ISO timestamp
}

export function AnswerEditButton({ answerId, initialBody, createdAt }: Props) {
  const withinWindow = Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;

  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!withinWindow) return null;

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/answers/${answerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to save. Please try again.");
          return;
        }
        setSavedBody(body);
        setSaved(true);
        setIsEditing(false);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 mt-1">
        {saved && (
          <span className="text-xs text-green-600 dark:text-green-400">✓ Edited</span>
        )}
        <button
          type="button"
          onClick={() => {
            setBody(savedBody);
            setSaved(false);
            setIsEditing(true);
          }}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Edit (within 15 min)
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={5000}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
      <p className="text-xs text-muted-foreground text-right">{body.length}/5000</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || body.trim().length < 10}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => { setIsEditing(false); setBody(savedBody); setError(null); }}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
