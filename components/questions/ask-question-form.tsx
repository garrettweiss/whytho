"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useUser } from "@/lib/auth/use-user";
import styles from "./face-questions.module.css";

const MIN = 10;
const MAX = 500;
const SITE_KEY = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? "";

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
  const turnstileRef = useRef<TurnstileInstance>(null);
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

  useEffect(() => {
    if (success) successRef.current?.focus();
    else if (focusQuestionOnReset.current) {
      textareaRef.current?.focus();
      focusQuestionOnReset.current = false;
    }
  }, [success]);

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
    const token = turnstileRef.current?.getResponse();
    if (!token) {
      setError("Please complete the verification check. If it has not loaded, try refreshing the page.");
      return;
    }

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
          turnstileRef.current?.reset();
          return;
        }
        setSuccess(true);
        setText("");
        turnstileRef.current?.reset();
        router.refresh();
        onSubmitted?.();
      } catch {
        setError("We could not confirm submission. Check the questions before trying again.");
        turnstileRef.current?.reset();
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
    <Turnstile ref={turnstileRef} siteKey={SITE_KEY} options={{ size: "invisible", theme: face ? "dark" : "auto" }} />
    {error && <p id={`${id}-error`} role="alert" className={face ? styles.error : "text-sm text-destructive"}>{error}</p>}
    <button type="submit" disabled={!isValid || isPending} className={buttonClass}>{isPending ? "Submitting…" : "Submit question"} <span aria-hidden="true">↗</span></button>
  </form>;
}
