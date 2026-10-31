"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_SCRIPT_ID, Turnstile } from "@marsidev/react-turnstile";
import { useUser } from "@/lib/auth/use-user";
import styles from "./face-questions.module.css";

const MIN = 10;
const MAX = 500;
const SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? "";
const VERIFICATION_LOAD_TIMEOUT_MS = 15_000;
const VERIFICATION_MESSAGES = {
  loading: "Loading verification…",
  ready: "Complete the verification check below. It may finish automatically.",
  verified: "Verification complete.",
  error: "Verification could not load or finish. Retry below. If it keeps failing, allow this site in your content blocker or try another browser.",
  expired: "Verification expired. Retry the check before submitting.",
  unavailable: "Verification is temporarily unavailable. Please try again later.",
  unsupported: "This browser could not run verification. Try an updated browser.",
} as const;
type VerificationStatus = keyof typeof VERIFICATION_MESSAGES;
type VerificationState = { status: VerificationStatus; token: string | null };

interface Props {
  politicianId: string;
  politicianName: string;
  onSubmitted?: () => void;
  appearance?: "default" | "face";
}

export function AskQuestionForm({ politicianId, politicianName, onSubmitted, appearance = "default" }: Props) {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [verification, setVerification] = useState<VerificationState>({ status: SITE_KEY ? "loading" : "unavailable", token: null });
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const verificationRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const focusQuestionOnReset = useRef(false);
  const face = appearance === "face";
  const charCount = text.length;
  const isValid = text.trim().length >= MIN && charCount <= MAX;
  const rootClass = face ? styles.ask : "rounded-xl border bg-card p-5 shadow-sm space-y-3";
  const titleClass = face ? styles.askTitle : "text-sm font-medium";
  const textClass = face ? styles.askHint : "text-sm text-muted-foreground";
  const buttonClass = face ? styles.submitButton : "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed";
  const signInHref = `/sign-in?redirect=${encodeURIComponent(`${pathname}#ask-question`)}`;
  const verified = verification.status === "verified" && !!verification.token;
  const canRetryVerification = verification.status === "error" || verification.status === "expired";

  useEffect(() => {
    if (success) successRef.current?.focus();
    else if (focusQuestionOnReset.current) {
      textareaRef.current?.focus();
      focusQuestionOnReset.current = false;
    }
  }, [success]);

  useEffect(() => {
    if (isLoading || !user || user.is_anonymous || success || isPending || verification.status !== "loading") return;
    // Wait for a challenge callback, not onWidgetLoad (container mount).
    // This also covers blocked scripts without scriptOptions.onError, which
    // removes the library's onload callback in react-turnstile 1.4.2.
    const timeout = window.setTimeout(() => {
      setVerification((current) => current.status === "loading" ? { status: "error", token: null } : current);
    }, VERIFICATION_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [isLoading, user, success, isPending, verification.status, verificationAttempt]);

  function restartVerification() {
    // Remounting alone cannot retry a script that failed to load: the library
    // skips injection while its previous script element is still present.
    if (!window.turnstile) document.getElementById(DEFAULT_SCRIPT_ID)?.remove();
    setVerification({ status: SITE_KEY ? "loading" : "unavailable", token: null });
    setVerificationAttempt((attempt) => attempt + 1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
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

    // Tokens are single-use, including when the server rejects the question.
    setVerification({ status: "loading", token: null });
    startTransition(async () => {
      try {
        const response = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ politician_id: politicianId, body: text.trim(), turnstile_token: token }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
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
      <h2 id={`${id}-title`} className={titleClass}>Your question belongs here.</h2>
      <p className={textClass}>Ask {politicianName} something specific. People can vote to bring it to their attention.</p>
      <Link href={signInHref} className={buttonClass}>Sign in to ask <span aria-hidden="true">↗</span></Link>
    </section>;
  }

  if (success) {
    return <section id="ask-question" className={rootClass} aria-label="Question submitted">
      <p ref={successRef} tabIndex={-1} role="status" className={face ? styles.success : "text-sm font-medium text-green-700 dark:text-green-400"}>Your question has been submitted.</p>
      <p className={textClass}>It may take a moment to appear in the list.</p>
      <button type="button" onClick={() => { focusQuestionOnReset.current = true; setSuccess(false); }} className={face ? styles.textButton : "min-h-11 text-sm underline underline-offset-2"}>Ask another question</button>
    </section>;
  }

  return <form id="ask-question" className={rootClass} onSubmit={handleSubmit} aria-labelledby={`${id}-title`} aria-busy={isPending}>
    <h2 id={`${id}-title`} className={titleClass}>Ask {politicianName}.</h2>
    <label htmlFor={`${id}-question`} className={face ? styles.inputLabel : "block text-sm font-medium"}>Your question</label>
    <textarea ref={textareaRef} id={`${id}-question`} name="question" value={text} onChange={(event) => setText(event.target.value)}
      placeholder="What do you want them to answer? Be specific and respectful." rows={4} minLength={MIN} maxLength={MAX} required disabled={isPending}
      aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
      className={face ? styles.textarea : "w-full resize-y rounded-md border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"} />
    <div className={face ? styles.formMeta : "flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"}>
      <p id={`${id}-hint`}>10–500 characters. Up to 5 questions per day.</p>
      <span id={`${id}-count`} aria-label={`${charCount} of ${MAX} characters`}>{charCount}/{MAX}</span>
    </div>
    <div ref={verificationRef} role="group" tabIndex={-1} aria-labelledby={`${id}-verification-title`} aria-describedby={`${id}-verification-status`} className="space-y-2">
      <p id={`${id}-verification-title`} className={face ? styles.inputLabel : "text-sm font-medium"}>Security verification</p>
      <p id={`${id}-verification-status`} role="status" className={canRetryVerification || verification.status === "unavailable" || verification.status === "unsupported" ? (face ? styles.error : "text-sm text-destructive") : textClass}>{VERIFICATION_MESSAGES[verification.status]}</p>
      {SITE_KEY && <Turnstile key={verificationAttempt} id={`${id}-turnstile`} siteKey={SITE_KEY}
        options={{ size: "compact", appearance: "always", theme: face ? "dark" : "auto", retry: "never", refreshExpired: "manual", refreshTimeout: "manual" }}
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
    <button type="submit" disabled={!isValid || isPending || !verified} aria-describedby={`${id}-verification-status`} className={buttonClass}>{isPending ? "Submitting…" : "Submit question"} <span aria-hidden="true">↗</span></button>
  </form>;
}
