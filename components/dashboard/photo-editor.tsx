"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PORTRAIT_BYTES, PORTRAIT_RIGHTS_TEXT } from "@/lib/photos/policy";
import styles from "./dashboard.module.css";

export function PhotoEditor({ politicianId, currentPhotoUrl }: { politicianId: string; currentPhotoUrl: string | null }) {
  const id = useId();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(currentPhotoUrl);
  const [credit, setCredit] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(currentPhotoUrl); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, currentPhotoUrl]);

  async function upload() {
    if (!file || pending) return;
    setError(null); setSaved(false); setPending(true);
    try {
      const form = new FormData();
      form.set("file", file); form.set("politician_id", politicianId);
      form.set("credit", credit); form.set("rights_confirmed", String(confirmed));
      const response = await fetch("/api/dashboard/photo", { method: "POST", body: form });
      const result = await response.json() as { success?: boolean; photo_url?: string; error?: string };
      if (!response.ok || result.success !== true) throw new Error(result.error ?? "The photo could not be saved.");
      setSaved(true); setFile(null); setConfirmed(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "The upload could not be confirmed. Refresh before retrying."); }
    finally { setPending(false); }
  }
  return <div className={styles.field}>
    <h3>Profile photo</h3>
    <p>Choose a clear portrait, at least 400 × 500 pixels. JPEG, PNG or WebP, up to 4 MB. The preview shows the center crop used on your profile.</p>
    {preview && <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Profile photo preview" width={160} height={200} style={{ objectFit: "cover", borderRadius: 8 }} referrerPolicy="no-referrer" />
    </div>}
    <label htmlFor={`${id}-photo`}>Choose photo</label>
    <input id={`${id}-photo`} type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={event => {
      const next = event.target.files?.[0] ?? null;
      setSaved(false); setConfirmed(false); setError(null);
      if (next && next.size > MAX_PORTRAIT_BYTES) { setError("Choose a photo of 4 MB or less."); setFile(null); return; }
      setFile(next);
    }} />
    <label htmlFor={`${id}-credit`}>Photographer or copyright holder</label>
    <input id={`${id}-credit`} value={credit} maxLength={160} onChange={e => setCredit(e.target.value)} placeholder="Credit shown with your photo" disabled={pending} />
    <label htmlFor={`${id}-rights`} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <input id={`${id}-rights`} type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={pending} style={{ width: "auto", marginTop: 4 }} />
      <span>{PORTRAIT_RIGHTS_TEXT}</span>
    </label>
    <button type="button" className={styles.button} disabled={!file || !confirmed || credit.trim().length < 2 || pending} onClick={upload}>{pending ? "Uploading…" : "Save profile photo"}</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {saved && <p role="status" className={styles.success}>Your profile photo is saved.</p>}
  </div>;
}
