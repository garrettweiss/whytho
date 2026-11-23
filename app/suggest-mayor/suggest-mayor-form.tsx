"use client";

import { DEFAULT_SCRIPT_ID, Turnstile } from "@marsidev/react-turnstile";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { STATES } from "@/lib/search/states";
import styles from "@/components/verify/verify.module.css";

const SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;
const MESSAGES = {
  loading: "Loading security verification…",
  ready: "Complete the security check below.",
  verified: "Security verification complete.",
  retry: "Security verification could not finish. Retry the check.",
  unavailable: "Security verification is temporarily unavailable.",
};

export function SuggestMayorForm() {
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [verification, setVerification] = useState<keyof typeof MESSAGES>(SITE_KEY ? "loading" : "unavailable");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const confirmation = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (submitted) confirmation.current?.focus();
  }, [submitted]);

  useEffect(() => {
    if (verification !== "loading" || pending || submitted) return;
    const timer = window.setTimeout(() => setVerification("retry"), 15_000);
    return () => window.clearTimeout(timer);
  }, [attempt, pending, submitted, verification]);

  function resetVerification() {
    if (!window.turnstile) document.getElementById(DEFAULT_SCRIPT_ID)?.remove();
    setToken("");
    setVerification("loading");
    setAttempt((value) => value + 1);
  }

  function verificationFailed() {
    setToken("");
    setVerification("retry");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/politicians/suggest-mayor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          city: fields.get("city"),
          state: fields.get("state"),
          source: fields.get("source"),
          turnstile_token: token,
        }),
      });
      if (response.ok) {
        setSubmitted(true);
        return;
      }
      const body = await response.json();
      setError(body.error ?? "The suggestion could not be submitted. Please try again.");
    } catch {
      setError("The suggestion could not be confirmed. Please try again.");
    } finally {
      resetVerification();
      setPending(false);
    }
  }

  if (submitted) return <div className={styles.wizard}>
    <p className={styles.success} role="status" ref={confirmation} tabIndex={-1}>Your suggestion was sent for review.</p>
  </div>;

  return <form className={`${styles.wizard} ${styles.stack}`} onSubmit={submit} aria-busy={pending}>
    <div className={styles.requestFields}>
      <label className={`${styles.field} ${styles.requestFull}`}>
        <span className={styles.label}>Mayor’s name</span>
        <input className={styles.input} name="name" minLength={2} maxLength={120} required disabled={pending} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>City or town</span>
        <input className={styles.input} name="city" minLength={2} maxLength={120} required disabled={pending} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>State</span>
        <select className={styles.input} name="state" defaultValue="" required disabled={pending}>
          <option value="" disabled>Select a state</option>
          {STATES.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      <label className={`${styles.field} ${styles.requestFull}`}>
        <span className={styles.label}>Official city page naming the mayor</span>
        <input className={styles.input} name="source" type="url" placeholder="https://" maxLength={1000} required disabled={pending} />
      </label>
    </div>
    <div>
      <p id="mayor-verification" role="status" className={styles.searchStatus}>{MESSAGES[verification]}</p>
      {SITE_KEY && <Turnstile key={attempt} siteKey={SITE_KEY}
        options={{ action: "suggest-mayor", size: "compact", theme: "dark", retry: "never", refreshExpired: "manual", refreshTimeout: "manual" }}
        onBeforeInteractive={() => setVerification("ready")}
        onSuccess={(value) => { setToken(value); setVerification("verified"); }}
        onError={verificationFailed} onExpire={verificationFailed} onTimeout={verificationFailed} onUnsupported={verificationFailed} />}
      {verification === "retry" && <button type="button" className={styles.textButton} onClick={resetVerification} disabled={pending}>Retry security check</button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div><button className={styles.primary} type="submit" disabled={pending || !token} aria-describedby="mayor-verification">{pending ? "Submitting…" : "Submit suggestion"}</button></div>
  </form>;
}
