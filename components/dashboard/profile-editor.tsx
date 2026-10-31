"use client";

import { useId, useState, useTransition } from "react";

import styles from "./dashboard.module.css";

interface SocialHandles {
  x?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
}

interface Props {
  politicianId: string;
  currentWebsiteUrl: string | null;
  currentBio: string | null;
  currentSocialHandles?: SocialHandles | null;
}

export function ProfileEditor({ politicianId, currentWebsiteUrl, currentBio, currentSocialHandles }: Props) {
  const fieldId = useId();
  const handles = currentSocialHandles ?? {};
  const [isOpen, setIsOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(currentWebsiteUrl ?? "");
  const [bio, setBio] = useState(currentBio ?? "");
  const [instagram, setInstagram] = useState(handles.instagram ?? "");
  const [facebook, setFacebook] = useState(handles.facebook ?? "");
  const [tiktok, setTiktok] = useState(handles.tiktok ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const socialHandles: SocialHandles = { ...handles };
        if (instagram.trim()) socialHandles.instagram = instagram.trim().replace(/^@/, "");
        else delete socialHandles.instagram;
        if (facebook.trim()) socialHandles.facebook = facebook.trim();
        else delete socialHandles.facebook;
        if (tiktok.trim()) socialHandles.tiktok = tiktok.trim().replace(/^@/, "");
        else delete socialHandles.tiktok;

        const res = await fetch("/api/dashboard/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            politician_id: politicianId,
            website_url: websiteUrl,
            bio,
            social_handles: socialHandles,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to save. Please try again.");
          return;
        }
        setSaved(true);
        setIsOpen(false);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return <section className={styles.panel}>
    <button type="button" onClick={() => setIsOpen(o => !o)} aria-expanded={isOpen} aria-controls={`${fieldId}-panel`} className={styles.panelToggle}>
      <span>Edit public profile</span><span aria-hidden="true">{isOpen ? "−" : "+"}</span>
    </button>
    {saved && <p role="status" className={`${styles.meta} ${styles.success}`}>Profile updated.</p>}
    {isOpen && <div id={`${fieldId}-panel`} className={styles.panelBody}>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-website`}>Website URL</label>
        <input id={`${fieldId}-website`} type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://yourwebsite.gov" />
        <p>Required for website meta tag verification.</p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-bio`}>Public bio</label>
        <textarea id={`${fieldId}-bio`} value={bio} onChange={e => setBio(e.target.value)} placeholder="A brief description visible on your public profile." rows={5} maxLength={1000} />
        <p>{bio.length}/1000 characters</p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-instagram`}>Instagram</label>
        <input id={`${fieldId}-instagram`} type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@yourhandle" />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-facebook`}>Facebook</label>
        <input id={`${fieldId}-facebook`} type="text" value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="facebook.com/yourpage or page name" />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-tiktok`}>TikTok</label>
        <input id={`${fieldId}-tiktok`} type="text" value={tiktok} onChange={e => setTiktok(e.target.value)} placeholder="@yourhandle" />
        <p>These links appear on your public profile.</p>
      </div>
      {error && <p role="alert" className={`${styles.meta} ${styles.error}`}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={handleSave} disabled={isPending} className={styles.button}>{isPending ? "Saving…" : "Save changes"}</button>
        <button type="button" onClick={() => setIsOpen(false)} disabled={isPending} className={styles.secondaryButton}>Cancel</button>
      </div>
    </div>}
  </section>;
}
