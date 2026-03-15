"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const MIN = 10;
const MAX = 5000;

interface Props {
  questionId: string;
  questionBody: string;
  isAdmin: boolean;
  onAnswered?: () => void;
}

export function AnswerComposer({ questionId, questionBody, isAdmin, onAnswered }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [answerType, setAnswerType] = useState<"direct" | "team_statement">(
    isAdmin ? "direct" : "team_statement"
  );
  const [sources, setSources] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const charCount = text.length;
  const isValid = charCount >= MIN && charCount <= MAX;

  function parseSourceUrls(raw: string): string[] {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: questionId,
            body: text.trim(),
            answer_type: answerType,
            sources: parseSourceUrls(sources),
          }),
        });

        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          return;
        }

        setSuccess(true);
        setText("");
        setSources("");
        router.refresh();
        onAnswered?.();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-4 py-3">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          ✓ Answer published successfully.
        </p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-left"
      >
        + Write an answer to this question
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
      {/* Question preview */}
      <div className="rounded-md bg-muted/50 px-3 py-2">
        <p className="text-xs text-muted-foreground mb-0.5">Answering:</p>
        <p className="text-sm font-medium line-clamp-2">{questionBody}</p>
      </div>

      {/* Answer type selector — admin only */}
      {isAdmin && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAnswerType("direct")}
            className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              answerType === "direct"
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            }`}
          >
            🏛️ Direct (from politician)
          </button>
          <button
            type="button"
            onClick={() => setAnswerType("team_statement")}
            className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              answerType === "team_statement"
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            }`}
          >
            👥 Team Statement
          </button>
        </div>
      )}

      {/* Answer body */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => {
            if (e.target.value.length <= MAX) setText(e.target.value);
          }}
          placeholder="Write your answer here. Be clear, specific, and honest."
          rows={5}
          disabled={isPending}
          className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <span
          className={`absolute bottom-2 right-2 text-xs tabular-nums ${
            charCount > MAX - 200
              ? charCount > MAX
                ? "text-destructive"
                : "text-amber-500"
              : "text-muted-foreground"
          }`}
        >
          {charCount}/{MAX}
        </span>
      </div>

      {/* Sources */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Sources (optional — one per line or comma-separated URLs)
        </label>
        <textarea
          value={sources}
          onChange={(e) => setSources(e.target.value)}
          placeholder="https://example.gov/statement"
          rows={2}
          disabled={isPending}
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setIsOpen(false); setError(null); setText(""); }}
          disabled={isPending}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isPending}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Publishing…" : "Publish Answer"}
        </button>
      </div>
    </div>
  );
}
