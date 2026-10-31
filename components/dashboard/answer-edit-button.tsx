"use client";

import { useId, useState, useTransition } from "react";

import styles from "./dashboard.module.css";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Props {
  answerId: string;
  initialBody: string;
  createdAt: string; // ISO timestamp
}

export function AnswerEditButton({ answerId, initialBody, createdAt }: Props) {
  const fieldId = useId();
  const withinWindow = Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;

  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!withinWindow) return null;

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/answers/${answerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to save. Please try again.");
          return;
        }
        setSavedBody(body);
        setSaved(true);
        setIsEditing(false);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (!isEditing) {
    return (
      <div className={styles.actions}>
        {saved && (
          <span role="status" className={`${styles.meta} ${styles.success}`}>✓ Edited</span>
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
          Edit (within 15 min)
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panelBody}>
      <div className={styles.field}>
      <label htmlFor={fieldId}>Edit your response</label>
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
          {isPending ? "Saving…" : "Save"}
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
