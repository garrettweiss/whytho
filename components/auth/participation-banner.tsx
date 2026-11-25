"use client";

import Link from "next/link";
import { useState } from "react";
import { useParticipation } from "./participation-provider";

export function ParticipationConfirmation({ forQuestion = false, onConfirm }: {
  forQuestion?: boolean;
  onConfirm?: () => void;
}) {
  const { status, saveError, confirm } = useParticipation();
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);

  if (status !== "required" && status !== "saving") return null;
  const saving = status === "saving";

  return <fieldset disabled={saving} className="space-y-2">
    <legend className="text-sm font-medium">Confirm your age and accept the Terms</legend>
    <p className="text-sm">{forQuestion ? "Confirm once to submit questions." : "You can keep browsing without confirming."}</p>
    <label className="block text-sm">
      <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} /> I am 18 or older.
    </label>
    <div className="text-sm">
      <label>
        <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /> I agree to the Terms of Service.
      </label>{" "}
      <Link href="/terms" target="_blank" rel="noopener" className="underline">Read the Terms<span className="sr-only"> (opens in a new tab)</span></Link>
    </div>
    <button type="button" className="min-h-11 text-sm underline disabled:opacity-60" disabled={!adult || !terms || saving}
      onClick={() => { onConfirm?.(); void confirm(); }}>
      {saving ? "Saving confirmation…" : "Confirm age and Terms"}
    </button>
    {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
  </fieldset>;
}

export function ParticipationBanner() {
  const { status } = useParticipation();
  if (status !== "required" && status !== "saving") return null;

  return <section aria-label="Participation confirmation" className="border-b bg-muted px-4 py-4">
    <ParticipationConfirmation />
  </section>;
}
