"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import styles from "./dashboard.module.css";

interface Props {
  answerId: string;
  initialBody: string;
  createdAt?: string;
  isDraft?: boolean;
}

export function AnswerCorrectionButton({ answerId }: { answerId: string }) {
  return <AnswerEditButton answerId={answerId} initialBody="" />;
}

export function AnswerEditButton({ answerId, initialBody, isDraft = false }: Props) {
  const fieldId = useId();
  const router = useRouter();
  const correctionRequest = useRef<{ id: string; body: string } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(isDraft ? initialBody : "");
  const [savedBody, setSavedBody] = useState(isDraft ? initialBody : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const text = body.trim();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        if (!isDraft && correctionRequest.current?.body !== text) {
          correctionRequest.current = { id: crypto.randomUUID(), body: text };
        }
        const res = await fetch(`/api/answers/${answerId}`, {
          method: isDraft ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text, correctionId: correctionRequest.current?.id }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to save. Please try again.");
          return;
        }
        if (isDraft) setSavedBody(text);
        correctionRequest.current = null;
        setSaved(true);
        setIsEditing(false);
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (!isEditing) {
    return (
      <div className={styles.actions}>
        {saved && (
          <span role="status" className={`${styles.meta} ${styles.success}`}>{isDraft ? "Draft saved" : "Correction published"}</span>
        )}
        <button
          type="button"
          onClick={() => {
            setBody(savedBody);
            setSaved(false);
            setIsEditing(true);
          }}
          className={styles.textButton}
        >
          {isDraft ? "Edit draft" : "Add correction"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panelBody}>
      <div className={styles.field}>
      <label htmlFor={fieldId}>{isDraft ? "Edit your response" : "Correction to your published response"}</label>
      {!isDraft && <p>The correction will appear publicly alongside the original response.</p>}
      <textarea
        id={fieldId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={5000}
      />
      <p>{body.length}/5000 characters</p>
      </div>
      {error && <p role="alert" className={`${styles.meta} ${styles.error}`}>{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || body.trim().length < 10}
          className={styles.button}
        >
          {isPending ? "Saving…" : isDraft ? "Save" : "Publish correction"}
        </button>
        <button
          type="button"
          onClick={() => { setIsEditing(false); setBody(savedBody); setError(null); }}
          disabled={isPending}
          className={styles.secondaryButton}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
