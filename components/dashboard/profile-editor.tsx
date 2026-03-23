"use client";

import { useState, useTransition } from "react";

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

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>Edit Profile</span>
        <span className="text-muted-foreground text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="border-t px-4 py-4 space-y-4 bg-muted/10">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="website-url">
              Website URL
            </label>
            <input
              id="website-url"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourwebsite.gov"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Required for website meta tag verification.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide" htmlFor="bio">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A brief description visible on your public profile."
              rows={3}
              maxLength={1000}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{bio.length}/1000</p>
          </div>

          {/* Social accounts */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Social Accounts</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm w-24 shrink-0 text-muted-foreground">Instagram</span>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@yourhandle"
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-24 shrink-0 text-muted-foreground">Facebook</span>
                <input
                  type="text"
                  value={facebook}
                  onChange={(e) => setFacebook(e.target.value)}
                  placeholder="facebook.com/yourpage or page name"
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-24 shrink-0 text-muted-foreground">TikTok</span>
                <input
                  type="text"
                  value={tiktok}
                  onChange={(e) => setTiktok(e.target.value)}
                  placeholder="@yourhandle"
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Display only — links shown on your public profile.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-green-600 dark:text-green-400">✓ Profile updated</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
