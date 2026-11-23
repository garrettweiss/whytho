"use client";

import { useEffect, useId, useState } from "react";
import { QUESTION_NOTICE_TEXT, QUESTION_NOTICE_VERSION } from "@/lib/notifications/consent";
import styles from "./dashboard.module.css";

export function QuestionEmailPreferences({ politicianId, profileVerified }: { politicianId: string; profileVerified: boolean }) {
  const id = useId();
  const [mode, setMode] = useState<"off" | "daily">("off");
  const [timezone, setTimezone] = useState("UTC");
  const [consent, setConsent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    fetch("/api/settings/office-notifications", { signal: abort.signal, cache: "no-store" }).then(async res => {
      if (!res.ok) throw new Error("Could not load question email settings. Please try again later.");
      const data = await res.json() as { preferences: { politician_id: string; mode: "off" | "daily"; timezone: string }[] };
      const current = data.preferences.find(pref => pref.politician_id === politicianId);
      if (current) { setMode(current.mode); setTimezone(current.timezone); }
      setLoaded(true);
    }).catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Could not load settings."); });
    return () => abort.abort();
  }, [politicianId]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/settings/office-notifications", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ politician_id: politicianId, mode, timezone, ...(mode === "daily" ? { consent_version: QUESTION_NOTICE_VERSION } : {}) }) });
      const result = await res.json() as { error?: string };
      if (!res.ok) throw new Error(result.error || "Could not save your preference.");
      setConsent(false); setMessage(mode === "off" ? "Question emails are off." : "Preference saved. Question emails will begin only when the service is available.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your preference."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={save} className={styles.panel} aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>Question emails</h4>
    <p className={styles.meta}>Choose emails for your own account. Question emails are not sending yet.</p>
    <label htmlFor={`${id}-mode`}>Frequency</label>
    <select id={`${id}-mode`} value={mode} disabled={!loaded || saving} onChange={event => { setMode(event.target.value as "off" | "daily"); setConsent(false); }}>
      <option value="off">Off</option><option value="daily" disabled={!profileVerified}>Daily summary</option>
    </select>
    {mode === "daily" && <>
      <label htmlFor={`${id}-zone`}>Timezone</label>
      <input id={`${id}-zone`} value={timezone} onChange={event => { setTimezone(event.target.value); setConsent(false); }} maxLength={100} required disabled={saving} list={`${id}-zones`} />
      <datalist id={`${id}-zones`}>{[...new Set([timezone, "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "UTC"])].map(zone => <option key={zone} value={zone} />)}</datalist>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={saving} /> {QUESTION_NOTICE_TEXT}</label>
    </>}
    {!profileVerified && <p className={styles.meta}>Daily summaries require a verified office profile.</p>}
    <button type="submit" className={styles.secondaryButton} disabled={!loaded || saving || (mode === "daily" && !consent)}>{saving ? "Saving…" : "Save email preference"}</button>
    {error && <p role="alert" className={styles.meta}>{error}</p>}
    {message && <p role="status" className={styles.meta}>{message}</p>}
  </form>;
}
