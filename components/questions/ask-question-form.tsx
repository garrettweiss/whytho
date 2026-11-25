"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_SCRIPT_ID, Turnstile } from "@marsidev/react-turnstile";
import { ParticipationConfirmation } from "@/components/auth/participation-banner";
import { useParticipation } from "@/components/auth/participation-provider";
import styles from "./face-questions.module.css";

const MIN = 10;
const MAX = 500;
const SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? "";
const VERIFICATION_LOAD_TIMEOUT_MS = 15_000;
const VERIFICATION_MESSAGES = {
  loading: "Loading verification…",
  ready: "Complete the check below to submit your question.",
  verified: "Verification complete.",
  error: "Verification could not load or finish. Retry below. If it keeps failing, allow this site in your content blocker or try another browser.",
  expired: "Verification expired. Retry the check before submitting.",
  unavailable: "Verification is temporarily unavailable. Please try again later.",
  unsupported: "This browser could not run verification. Try an updated browser.",
} as const;
type VerificationStatus = keyof typeof VERIFICATION_MESSAGES;
type VerificationState = { status: VerificationStatus; token: string | null };

const QUESTION_STARTERS = [
  { topic: "Housing", body: "Which housing-cost measures within your office’s authority will you prioritize, and how can residents track progress?" },
  { topic: "Transportation", body: "How does your office decide which transportation needs to prioritize, and where can residents review the criteria?" },
  { topic: "Public services", body: "How can residents track a request for help from your office, and what response time should they expect?" },
  { topic: "Transparency", body: "Where can residents find your office’s public updates, and how can they submit questions about them?" },
  { topic: "Health care", body: "Which health-care access priorities fall within your office’s responsibilities, and what action do you plan to take?" },
  { topic: "Emergency readiness", body: "How does your office help residents find reliable emergency-preparedness information?" },
] as const;

interface Props {
  politicianId: string;
  politicianName: string;
  onSubmitted?: () => void;
  appearance?: "default" | "face";
}

export function AskQuestionForm({ politicianId, politicianName, onSubmitted, appearance = "default" }: Props) {
  const { user, isLoading, status: participation, retry, requireConfirmation } = useParticipation();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [verification, setVerification] = useState<VerificationState>({ status: SITE_KEY ? "loading" : "unavailable", token: null });
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const focusConfirmation = useRef(false);
  const focusVerification = useRef(false);
  const verificationRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const focusQuestionOnReset = useRef(false);
  const face = appearance === "face";
  const charCount = text.length;
  const isValid = text.trim().length >= MIN && charCount <= MAX;
  const rootClass = face ? styles.ask : "rounded-xl border bg-card p-5 shadow-sm space-y-3";
  const hasDraft = text.trim().length > 0;
  function applyDraft(body: string) {
    setText((current) => current.trim() ? current : body);
    setError(null);
    textareaRef.current?.focus();
  }
  const titleClass = face ? styles.askTitle : "text-sm font-medium";
  const textClass = face ? styles.askHint : "text-sm text-muted-foreground";
  const buttonClass = face ? styles.submitButton : "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed";
  const signInHref = `/sign-in?redirect=${encodeURIComponent(`${pathname}#ask-question`)}`;
  const verified = verification.status === "verified" && !!verification.token;
  const canRetryVerification = verification.status === "error" || verification.status === "expired";
  const showVerification = verification.status !== "loading" && !verified;

  useEffect(() => {
    if (success) successRef.current?.focus();
    else if (focusQuestionOnReset.current) {
      textareaRef.current?.focus();
      focusQuestionOnReset.current = false;
    }
  }, [success]);

  useEffect(() => {
    if (participation === "required" && focusConfirmation.current) {
      confirmationRef.current?.focus();
      focusConfirmation.current = false;
    }
    if (participation === "accepted" && focusVerification.current) {
      verificationRef.current?.focus();
      focusVerification.current = false;
    }
  }, [participation]);

  useEffect(() => {
    if (participation !== "accepted" || isLoading || !user || user.is_anonymous || success || isPending || verification.status !== "loading") return;
    // Wait for a challenge callback, not onWidgetLoad (container mount).
    // This also covers blocked scripts without scriptOptions.onError, which
    // removes the library's onload callback in react-turnstile 1.4.2.
    const timeout = window.setTimeout(() => {
      setVerification((current) => current.status === "loading" ? { status: "error", token: null } : current);
    }, VERIFICATION_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [participation, isLoading, user, success, isPending, verification.status, verificationAttempt]);

  function restartVerification() {
    // Remounting alone cannot retry a script that failed to load: the library
    // skips injection while its previous script element is still present.
    if (!window.turnstile) document.getElementById(DEFAULT_SCRIPT_ID)?.remove();
    setVerification({ status: SITE_KEY ? "loading" : "unavailable", token: null });
    setVerificationAttempt((attempt) => attempt + 1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || participation !== "accepted") return;
    setError(null);
    if (!user || user.is_anonymous) {
      setError("Sign in to submit a question.");
      return;
    }
    if (!isValid) {
      setError(`Write a question between ${MIN} and ${MAX} characters.`);
      textareaRef.current?.focus();
      return;
    }
    const token = verification.token;
    if (!verified || !token) {
      verificationRef.current?.focus();
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ politician_id: politicianId, body: text.trim(), turnstile_token: token }),
        });
        const data = (await response.json()) as { error?: string; code?: string };
        if (!response.ok) {
          if (response.status === 403 && data.code === "ASSENT_REQUIRED") {
            focusConfirmation.current = true;
            requireConfirmation();
            return;
          }
          setError(data.error ?? "Your question was not submitted. Please try again.");
          return;
        }
        setSuccess(true);
        setText("");
        router.refresh();
        onSubmitted?.();
      } catch {
        setError("We could not confirm submission. Check the questions before trying again.");
      } finally {
        // The server may already have used this token.
        restartVerification();
      }
    });
  }

  if (isLoading) {
    return <section id="ask-question" className={rootClass} aria-label="Ask a question" aria-busy="true">
      <p role="status" className={textClass}>Loading question form…</p>
    </section>;
  }

  if (!user || user.is_anonymous) {
    return <section id="ask-question" className={rootClass} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={titleClass}>Ask {politicianName}</h2>
      <p className={textClass}>Ask about a decision, a vote, or an issue {politicianName} can act on. People upvote the questions they want answered.</p>
      <Link href={signInHref} className={buttonClass}>Sign in to ask</Link>
    </section>;
  }

  if (success) {
    return <section id="ask-question" className={rootClass} aria-label="Question submitted">
      <p ref={successRef} tabIndex={-1} role="status" className={face ? styles.success : "text-sm font-medium text-green-700 dark:text-green-400"}>Your question has been submitted.</p>
      <p className={textClass}>It may take a moment to appear in the list.</p>
      <button type="button" onClick={() => { focusQuestionOnReset.current = true; setSuccess(false); }} className={face ? styles.textButton : "min-h-11 text-sm underline underline-offset-2"}>Ask another question</button>
    </section>;
  }

  const sampleList = <aside className={face ? styles.starters : "space-y-2 text-sm text-muted-foreground"} aria-label="Question starters">
    <p className={face ? styles.startersLabel : undefined}>Question starters</p>
    <p>Choose a topic to start a draft you can edit.</p>
    <div className={face ? styles.starterChips : "flex flex-wrap gap-2"}>
      {QUESTION_STARTERS.map(({ topic, body }) => (
        <button key={topic} type="button" className={face ? styles.starterChip : "min-h-11 rounded-md border px-3"} disabled={isPending || hasDraft} onClick={() => applyDraft(body)}>{topic}</button>
      ))}
    </div>
    {hasDraft && <p>Clear your draft to choose another starter.</p>}
  </aside>;

  return <form id="ask-question" className={`${rootClass} ${face ? styles.askWide : ""}`} onSubmit={handleSubmit} aria-labelledby={`${id}-title`} aria-busy={isPending}>
    <h2 id={`${id}-title`} className={titleClass}>Ask {politicianName}</h2>
    <div className={face ? styles.askCols : "space-y-3"}>
    <div className={face ? styles.askMain : "space-y-3"}>
    <label htmlFor={`${id}-question`} className={face ? styles.inputLabel : "block text-sm font-medium"}>Your question</label>
    <textarea ref={textareaRef} id={`${id}-question`} name="question" value={text} onChange={(event) => setText(event.target.value)}
      placeholder={`Ask about a decision, a vote, or an issue ${politicianName} can act on. One clear question.`} rows={4} minLength={MIN} maxLength={MAX} required disabled={isPending}
      aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ""}`} aria-invalid={!!error && !isValid}
      className={face ? styles.textarea : "w-full resize-y rounded-md border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"} />
    <div className={face ? styles.formMeta : "flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"}>
      <p id={`${id}-hint`}>10–500 characters. You can ask each politician up to 5 questions per day.</p>
      <span id={`${id}-count`} aria-label={`${charCount} of ${MAX} characters`}>{charCount}/{MAX}</span>
    </div>
    {participation === "checking" && <p role="status" className={textClass}>Checking your age and Terms confirmation…</p>}
    {participation === "unavailable" && <div>
      <p role="alert" className={face ? styles.error : "text-sm text-destructive"}>We couldn’t check your age and Terms confirmation. Your draft is still here.</p>
      <button type="button" onClick={retry} className={face ? styles.textButton : "min-h-11 text-sm underline"}>Retry confirmation check</button>
    </div>}
    {(participation === "required" || participation === "saving") && <div ref={confirmationRef} tabIndex={-1} role="group" aria-label="Age and Terms confirmation">
      <ParticipationConfirmation forQuestion onConfirm={() => { focusVerification.current = true; }} />
    </div>}
    {participation === "accepted" && <>
      <div ref={verificationRef} role="group" tabIndex={-1} aria-label="Security verification" aria-describedby={`${id}-verification-status`} className={showVerification ? "space-y-2" : "sr-only"}>
        {showVerification && <p className={face ? styles.inputLabel : "text-sm font-medium"}>Security verification</p>}
        <p id={`${id}-verification-status`} role="status" className={canRetryVerification || verification.status === "unavailable" || verification.status === "unsupported" ? (face ? styles.error : "text-sm text-destructive") : textClass}>{VERIFICATION_MESSAGES[verification.status]}</p>
        {SITE_KEY && <Turnstile key={verificationAttempt} id={`${id}-turnstile`} siteKey={SITE_KEY}
          style={verified ? { display: "none" } : undefined}
          options={{ size: "compact", appearance: "interaction-only", theme: face ? "dark" : "auto", retry: "never", refreshExpired: "manual", refreshTimeout: "manual" }}
          onBeforeInteractive={() => setVerification({ status: "ready", token: null })}
          onSuccess={(token) => setVerification({ status: token ? "verified" : "error", token: token || null })}
          onExpire={() => setVerification({ status: "expired", token: null })}
          onError={(code) => {
            console.warn("Question verification failed", code);
            setVerification({ status: "error", token: null });
          }}
          onTimeout={() => setVerification({ status: "error", token: null })}
          onUnsupported={() => setVerification({ status: "unsupported", token: null })} />}
        {canRetryVerification && <button type="button" disabled={isPending} onClick={restartVerification} className={face ? styles.textButton : "min-h-11 text-sm underline underline-offset-2"}>Retry verification</button>}
      </div>
      {error && <p id={`${id}-error`} role="alert" className={face ? styles.error : "text-sm text-destructive"}>{error}</p>}
      <button type="submit" disabled={!isValid || isPending || !verified} aria-describedby={`${id}-verification-status`} className={buttonClass}>{isPending ? "Submitting…" : "Submit question"}</button>
    </>}
    </div>
    {sampleList}
    </div>
  </form>;
}
