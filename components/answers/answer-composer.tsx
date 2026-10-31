"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShareTray } from "@/components/answers/share-tray";
import { parseSavedAnswerResult, type SavedAnswerResult } from "./answer-result";
import { MAX_MEDIA_BYTES, MEDIA_TYPES } from "./media-limits";

const TEXT_MIN = 10;
const TEXT_MAX = 5000;

const ACCEPTED_MIME = Object.keys(MEDIA_TYPES).join(",");

type AnswerMode = "text" | "link";

interface MediaFile {
  file: File;
  previewUrl: string;
  mediaType: "image" | "video" | "audio";
}

interface Props {
  questionId: string;
  questionBody: string;
  politicianSlug: string;
  politicianName: string;
  isAdmin: boolean;
  profileVerified?: boolean;
  canPublish?: boolean;
  onAnswered?: () => void;
}

function detectSocialPlatform(url: string): string | null {
  if (/instagram\.com\/p\/|instagram\.com\/reel\//i.test(url)) return "instagram";
  if (/tiktok\.com\/@.*\/video\//i.test(url)) return "tiktok";
  if (/facebook\.com\/.*\/posts\/|fb\.watch\//i.test(url)) return "facebook";
  if (/x\.com\/.*\/status\/|twitter\.com\/.*\/status\//i.test(url)) return "x";
  return null;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "📷 Instagram post detected",
  tiktok: "🎵 TikTok video detected",
  facebook: "📘 Facebook post detected",
  x: "𝕏 X/Twitter post detected",
};

export function AnswerComposer({
  questionId,
  questionBody,
  politicianSlug,
  politicianName,
  isAdmin: _isAdmin,
  profileVerified = false,
  canPublish = false,
  onAnswered,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("text");
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [sources, setSources] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedAnswer, setSavedAnswer] = useState<SavedAnswerResult | null>(null);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const charCount = text.length;
  const isTextValid = charCount >= TEXT_MIN && charCount <= TEXT_MAX;
  const isLinkValid = linkUrl.startsWith("http") && linkUrl.length > 10;
  const isValid = mode === "text" ? isTextValid : isLinkValid;
  const detectedPlatform = mode === "link" ? detectSocialPlatform(linkUrl) : null;

  function parseSourceUrls(raw: string): string[] {
    return raw.split(/[\n,]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  }

  function buildBody(): string {
    if (mode === "link") {
      const desc = linkDescription.trim();
      return desc ? `${desc}\n\n${linkUrl}` : linkUrl;
    }
    return text.trim();
  }

  function buildSources(): string[] {
    if (mode === "link") return [linkUrl];
    return parseSourceUrls(sources);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newMedia: MediaFile[] = [];
    for (const file of files.slice(0, 5 - mediaFiles.length)) {
      const mime = file.type;
      const mediaType = MEDIA_TYPES[mime];
      if (!mediaType || file.size > MAX_MEDIA_BYTES) {
        setError(!mediaType ? "That file type is not supported. Choose a photo, video, or audio file." : "Files must be 4 MB or smaller. Use a link for larger media.");
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      newMedia.push({ file, previewUrl, mediaType });
    }

    setMediaFiles((prev) => [...prev, ...newMedia].slice(0, 5)); // max 5 files
    // reset input so same file can be re-selected
    e.target.value = "";
  }

  function removeMedia(index: number) {
    setMediaFiles((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index]!.previewUrl);
      next.splice(index, 1);
      return next;
    });
  }

  async function uploadMediaFiles(answerId: string) {
    for (let i = 0; i < mediaFiles.length; i++) {
      const { file } = mediaFiles[i]!;
      setUploadProgress(`Uploading media ${i + 1} of ${mediaFiles.length}…`);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/answers/${answerId}/media`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Failed to upload file ${i + 1}`);
      }
    }
    setUploadProgress(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        // The API applies the authenticated team's role and publication rules.
        const res = await fetch("/api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: questionId,
            body: buildBody(),
            sources: buildSources(),
          }),
        });

        let data: unknown;
        try {
          data = await res.json();
        } catch {
          setSubmissionUncertain(true);
          setError("We could not confirm the response status. Refresh to check before submitting again.");
          return;
        }

        if (!res.ok) {
          const message = data && typeof data === "object" && "error" in data ? data.error : null;
          setError(typeof message === "string" ? message : "Something went wrong. Please try again.");
          return;
        }

        let result: SavedAnswerResult;
        try {
          result = parseSavedAnswerResult(data);
        } catch (resultError) {
          setSubmissionUncertain(true);
          setError(resultError instanceof Error ? resultError.message : "We could not confirm the response status. Refresh before submitting again.");
          return;
        }
        const answerId = result.answerId;

        // Step 2: upload any attached media
        if (answerId && mediaFiles.length > 0) {
          try {
            await uploadMediaFiles(answerId);
          } catch (uploadErr) {
            // The response was saved even if a subsequent media upload failed.
            setError(`${result.isDraft ? "Draft saved" : "Answer published"}, but media upload failed: ${uploadErr instanceof Error ? uploadErr.message : "unknown error"}`);
          }
        }

        // Cleanup previews
        mediaFiles.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        setMediaFiles([]);
        setText("");
        setSources("");
        setLinkUrl("");
        setLinkDescription("");
        router.refresh();
        onAnswered?.();

        setSavedAnswer(result);
      } catch {
        setSubmissionUncertain(true);
        setError("The connection was interrupted and we could not confirm the response status. Refresh to check before submitting again.");
      }
    });
  }

  if (savedAnswer?.isDraft) {
    return <div className="border p-4 space-y-2">
      <p role="status" className="text-sm font-semibold">Private draft saved.</p>
      <p className="text-sm text-muted-foreground">Your response and attachments stay private. A verified profile and approval by an admin or editor are required before publication.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>;
  }

  // Sharing is available only after the API explicitly confirms publication.
  if (savedAnswer && !savedAnswer.isDraft) {
    return (
      <div>
      {error && <p role="alert" className="text-sm text-destructive mb-3">{error}</p>}
      <ShareTray
        answerId={savedAnswer.answerId}
        politicianName={politicianName}
        politicianSlug={politicianSlug}
        questionBody={questionBody}
      />
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-left"
      >
        {canPublish ? "+ Write a response to this question" : "+ Prepare a private draft"}
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
      {/* Question preview */}
      <div className="rounded-md bg-muted/50 px-3 py-2">
        <p className="text-xs text-muted-foreground mb-0.5">Answering:</p>
        <p className="text-sm font-medium line-clamp-2">{questionBody}</p>
      </div>

      {/* Mode: text vs link */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "text" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          ✍️ Written Answer
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "link" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          🔗 Link to Statement
        </button>
      </div>

      {/* Written answer */}
      {mode === "text" && (
        <>
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => { if (e.target.value.length <= TEXT_MAX) setText(e.target.value); }}
              placeholder="Write your answer here. Be clear, specific, and honest."
              rows={5}
              disabled={isPending}
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            <span className={`absolute bottom-2 right-2 text-xs tabular-nums ${
              charCount > TEXT_MAX - 200 ? charCount > TEXT_MAX ? "text-destructive" : "text-amber-500" : "text-muted-foreground"
            }`}>
              {charCount}/{TEXT_MAX}
            </span>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Sources (optional, one per line or comma-separated URLs)
            </label>
            <textarea
              value={sources}
              onChange={(e) => setSources(e.target.value)}
              placeholder="https://example.gov/statement"
              rows={2}
              disabled={isPending}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
        </>
      )}

      {/* Link to external statement */}
      {mode === "link" && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Statement URL <span className="text-destructive">*</span>
            </label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://yourwebsite.gov/statement, or paste an Instagram/TikTok/Facebook post"
              disabled={isPending}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            {detectedPlatform && (
              <p className="mt-1 text-xs text-muted-foreground">
                {PLATFORM_LABELS[detectedPlatform]} — this will be shown as a link with a preview on your profile.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Brief summary (optional, shown before the link)
            </label>
            <textarea
              value={linkDescription}
              onChange={(e) => { if (e.target.value.length <= 500) setLinkDescription(e.target.value); }}
              placeholder="I addressed this in my statement on March 15th…"
              rows={2}
              disabled={isPending}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
        </div>
      )}

      {/* Media upload */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Up to 5 files, 4 MB each. Use a link for larger media.</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Attach media (optional)</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || mediaFiles.length >= 5}
            className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40"
          >
            + Add photo / video / audio
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {mediaFiles.length > 0 && (
          <div className="space-y-2">
            {mediaFiles.map((m, i) => (
              <div key={i} className="relative rounded-lg border bg-muted/30 overflow-hidden">
                {m.mediaType === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.previewUrl} alt={m.file.name} className="w-full max-h-40 object-cover" />
                )}
                {m.mediaType === "video" && (
                  <video src={m.previewUrl} className="w-full max-h-40" controls preload="metadata" />
                )}
                {m.mediaType === "audio" && (
                  <div className="px-3 py-2">
                    <p className="text-xs text-muted-foreground mb-1 truncate">{m.file.name}</p>
                    <audio src={m.previewUrl} controls className="w-full" preload="metadata" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white text-xs leading-none hover:bg-black/80"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {mediaFiles.length > 0 && (
          <p className="text-xs text-muted-foreground">{mediaFiles.length}/5 file{mediaFiles.length !== 1 ? "s" : ""} attached</p>
        )}
      </div>

      {uploadProgress && <p className="text-xs text-muted-foreground">{uploadProgress}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {submissionUncertain && <button type="button" onClick={() => window.location.reload()} className="border px-4 py-2 text-sm">Refresh to check status</button>}

      <p className="text-xs text-muted-foreground">{!profileVerified
        ? "Identity verification is required before publishing. This response and its attachments will be saved as a private draft."
        : canPublish
          ? "This response will be published on the public profile when you submit it."
          : "Your response and attachments stay private until an admin or editor approves them for publication."}</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
            setText("");
            setLinkUrl("");
            setLinkDescription("");
            mediaFiles.forEach((m) => URL.revokeObjectURL(m.previewUrl));
            setMediaFiles([]);
          }}
          disabled={isPending}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isPending || submissionUncertain}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (uploadProgress ?? "Saving response…") : canPublish ? "Publish response" : "Save private draft"}
        </button>
      </div>
    </div>
  );
}
