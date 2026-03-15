"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useUser } from "@/lib/auth/use-user";

const MIN = 10;
const MAX = 500;
const SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? "";

interface Props {
  politicianId: string;
  politicianName: string;
  onSubmitted?: () => void; // parent can refresh question list
}

export function AskQuestionForm({ politicianId, politicianName, onSubmitted }: Props) {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileInstance>(null);

  const charCount = text.length;
  const isValid = charCount >= MIN && charCount <= MAX;

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (!isLoading && !user) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium mb-3">
          Ask {politicianName} a question
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Sign in to submit a question. Silence is its own answer.
        </p>
        <Link
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sign in to ask a question
        </Link>
      </div>
    );
  }

  function handleSubmit() {
    setError(null);
    const token = turnstileRef.current?.getResponse();

    if (!token) {
      setError("Please complete the verification check.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            politician_id: politicianId,
            body: text.trim(),
            turnstile_token: token,
          }),
        });

        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          turnstileRef.current?.reset();
          return;
        }

        setSuccess(true);
        setText("");
        turnstileRef.current?.reset();
        router.refresh();
        onSubmitted?.();
      } catch {
        setError("Network error. Please try again.");
        turnstileRef.current?.reset();
      }
    });
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm animate-pulse">
        <div className="h-4 w-48 bg-muted rounded" />
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          ✓ Question submitted! It will appear once the page refreshes.
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
        >
          Ask another question
        </button>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
      <p className="text-sm font-medium">Ask {politicianName} a question</p>

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => {
            if (e.target.value.length <= MAX) setText(e.target.value);
          }}
          placeholder="What do you want them to answer? Be specific and respectful."
          rows={3}
          disabled={isPending}
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <span
          className={`absolute bottom-2 right-2 text-xs tabular-nums ${
            charCount > MAX - 50
              ? charCount > MAX
                ? "text-destructive"
                : "text-amber-500"
              : "text-muted-foreground"
          }`}
        >
          {charCount}/{MAX}
        </span>
      </div>

      {/* Turnstile — invisible mode */}
      <Turnstile
        ref={turnstileRef}
        siteKey={SITE_KEY}
        options={{ size: "invisible" }}
      />

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Max {DAILY_LIMIT_MSG} questions per day · {MIN}–{MAX} characters
        </p>
        <button
          onClick={handleSubmit}
          disabled={!isValid || isPending}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Submitting…" : "Submit question"}
        </button>
      </div>
    </div>
  );
}

const DAILY_LIMIT_MSG = "5";
