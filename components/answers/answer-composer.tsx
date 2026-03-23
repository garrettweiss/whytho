"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TEXT_MIN = 10;
const TEXT_MAX = 5000;

type AnswerMode = "text" | "link";

interface Props {
  questionId: string;
  questionBody: string;
  isAdmin: boolean;
  onAnswered?: () => void;
}

export function AnswerComposer({ questionId, questionBody, isAdmin: _isAdmin, onAnswered }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("text");
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [sources, setSources] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const charCount = text.length;
  const isTextValid = charCount >= TEXT_MIN && charCount <= TEXT_MAX;
  const isLinkValid = linkUrl.startsWith("http") && linkUrl.length > 10;
  const isValid = mode === "text" ? isTextValid : isLinkValid;

  function parseSourceUrls(raw: string): string[] {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function buildBody(): string {
    if (mode === "link") {
      const desc = linkDescription.trim();
      return desc ? `${desc}\n\n${linkUrl}` : linkUrl;
    }
    return text.trim();
  }

  function buildSources(): string[] {
    if (mode === "link") return [linkUrl];
    return parseSourceUrls(sources);
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
            body: buildBody(),
            answer_type: "direct",
            sources: buildSources(),
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
        setLinkUrl("");
        setLinkDescription("");
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

      {/* Mode: text vs link */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "text" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          ✍️ Written Answer
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "link" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          🔗 Link to Statement
        </button>
      </div>

      {/* Written answer */}
      {mode === "text" && (
        <>
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => { if (e.target.value.length <= TEXT_MAX) setText(e.target.value); }}
              placeholder="Write your answer here. Be clear, specific, and honest."
              rows={5}
              disabled={isPending}
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            <span className={`absolute bottom-2 right-2 text-xs tabular-nums ${
              charCount > TEXT_MAX - 200 ? charCount > TEXT_MAX ? "text-destructive" : "text-amber-500" : "text-muted-foreground"
            }`}>
              {charCount}/{TEXT_MAX}
            </span>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Sources (optional, one per line or comma-separated URLs)
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
        </>
      )}

      {/* Link to external statement */}
      {mode === "link" && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Statement URL <span className="text-destructive">*</span>
            </label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://yourwebsite.gov/statement-on-question"
              disabled={isPending}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Brief summary (optional, shown before the link)
            </label>
            <textarea
              value={linkDescription}
              onChange={(e) => { if (e.target.value.length <= 500) setLinkDescription(e.target.value); }}
              placeholder="I addressed this in my statement on March 15th..."
              rows={2}
              disabled={isPending}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The link will be shown on your public profile with a summary of your position.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setIsOpen(false); setError(null); setText(""); setLinkUrl(""); setLinkDescription(""); }}
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
