"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";

interface Prefs {
  notify_answer: boolean;
  notify_digest: boolean;
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then((r) => {
        if (r.status === 401) {
          setUnauthenticated(true);
          return null;
        }
        return r.json() as Promise<Prefs>;
      })
      .then((data) => {
        if (data) setPrefs(data);
      })
      .catch(() => setError("Failed to load preferences"))
      .finally(() => setIsLoading(false));
  }, []);

  function handleToggle(key: keyof Prefs) {
    if (!prefs) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaved(null);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: updated[key] }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          setError(d.error ?? "Failed to save");
          // Revert
          setPrefs(prefs);
          return;
        }
        setSaved(key);
      } catch {
        setError("Network error");
        setPrefs(prefs);
      }
    });
  }

  if (unauthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-lg font-semibold">Sign in required</p>
          <p className="text-sm text-muted-foreground">
            You need to be signed in to manage your notification preferences.
          </p>
          <Link
            href="/auth/sign-in"
            className="inline-flex items-center justify-center w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-12 space-y-8">

        <div className="space-y-2">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
          <h1 className="text-2xl font-bold">Notification Preferences</h1>
          <p className="text-sm text-muted-foreground">
            Control which emails WhyTho sends you.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-5 h-20" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <ToggleRow
              label="Answer notifications"
              description="Get an email when your question receives an official response from a politician's team."
              enabled={prefs?.notify_answer ?? true}
              onToggle={() => handleToggle("notify_answer")}
              isPending={isPending}
              justSaved={saved === "notify_answer"}
            />
            <ToggleRow
              label="Weekly digest"
              description="Every Monday — a recap of the top questions, most responsive politicians, and platform highlights from the past week."
              enabled={prefs?.notify_digest ?? true}
              onToggle={() => handleToggle("notify_digest")}
              isPending={isPending}
              justSaved={saved === "notify_digest"}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">About these emails</p>
          <p>We only send emails you&apos;ve asked for. No marketing, no third-party sharing. Preferences are saved instantly.</p>
          <p className="mt-2">
            Questions? <a href="mailto:support@whytho.us" className="underline hover:text-foreground">support@whytho.us</a>
          </p>
        </div>

      </div>
    </main>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  isPending,
  justSaved,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  isPending: boolean;
  justSaved: boolean;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border bg-card p-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          {justSaved && (
            <span className="text-xs text-green-600 dark:text-green-400">✓ Saved</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        disabled={isPending}
        className={`relative shrink-0 h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60 ${
          enabled ? "bg-foreground" : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
        <span className="sr-only">{enabled ? "Enabled" : "Disabled"}</span>
      </button>
    </div>
  );
}
