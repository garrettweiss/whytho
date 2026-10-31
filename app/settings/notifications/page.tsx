"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";

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
        if (!r.ok) throw new Error("Preferences unavailable");
        return r.json() as Promise<Prefs>;
      })
      .then((data) => {
        if (data && typeof data.notify_answer === "boolean" && typeof data.notify_digest === "boolean") setPrefs(data);
        else if (data) throw new Error("Invalid preferences");
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

  return <PublicPage title="Your notifications." kicker="Account" description="Choose which WhyTho emails you receive." breadcrumbs={[{ label: "My account", href: "/account" }]}>
    <div className={styles.reading}>
      {unauthenticated ? <section><h2>Sign in to set your preferences.</h2><p>Your notification settings are connected to your account.</p><Link href="/sign-in?redirect=%2Fsettings%2Fnotifications" className={styles.button}>Sign in →</Link></section> : isLoading ? <p role="status">Loading your preferences…</p> : prefs ? <>
        <ToggleRow label="Answer notifications" description="Receive an email when your question receives an official response." enabled={prefs.notify_answer} onToggle={() => handleToggle("notify_answer")} isPending={isPending} justSaved={saved === "notify_answer"} />
        <ToggleRow label="Weekly digest" description="Receive a recap of questions and activity from the previous week." enabled={prefs.notify_digest} onToggle={() => handleToggle("notify_digest")} isPending={isPending} justSaved={saved === "notify_digest"} />
        <p>Preferences save when you change them.</p>
      </> : <section><h2>Preferences couldn’t load.</h2><p>Your saved choices are unavailable right now.</p><button type="button" className={styles.button} onClick={() => window.location.reload()}>Try again</button></section>}
      {error && <p role="alert">{error}</p>}
    </div>
  </PublicPage>;
}

function ToggleRow({ label, description, enabled, onToggle, isPending, justSaved }: { label: string; description: string; enabled: boolean; onToggle: () => void; isPending: boolean; justSaved: boolean }) {
  return <div className={styles.preference}><div><h2>{label}</h2><p>{description}</p>{justSaved && <p role="status">✓ Saved</p>}</div>
    <button type="button" role="switch" aria-label={label} aria-checked={enabled} onClick={onToggle} disabled={isPending} className={styles.switch}>{enabled ? "On" : "Off"}</button>
  </div>;
}
