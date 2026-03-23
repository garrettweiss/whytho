"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShareTray } from "@/components/answers/share-tray";

const TEXT_MIN = 10;
const TEXT_MAX = 5000;

const ACCEPTED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/x-m4a",
].join(",");

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
  const [publishedAnswerId, setPublishedAnswerId] = useState<string | null>(null);
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
    for (const file of files) {
      const mime = file.type;
      let mediaType: "image" | "video" | "audio" | null = null;
      if (mime.startsWith("image/")) mediaType = "image";
      else if (mime.startsWith("video/")) mediaType = "video";
      else if (mime.startsWith("audio/")) mediaType = "audio";
      if (!mediaType) continue;

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
        // Step 1: publish the answer
        const res = await fetch("/api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: questionId,
            body: buildBody(),
            answer_type: "direct",
            sources: buildSources(),
          }),
        });

        const data = (await res.json()) as { error?: string; answer?: { id: string } };

        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          return;
        }

        const answerId = data.answer?.id;

        // Step 2: upload any attached media
        if (answerId && mediaFiles.length > 0) {
          try {
            await uploadMediaFiles(answerId);
          } catch (uploadErr) {
            // Answer is already published — note the failure but don't block success
            setError(`Answer published, but media upload failed: ${uploadErr instanceof Error ? uploadErr.message : "unknown error"}`);
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

        if (answerId) {
          setPublishedAnswerId(answerId);
        }
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  // Share tray after publish
  if (publishedAnswerId) {
    return (
      <ShareTray
        answerId={publishedAnswerId}
        politicianName={politicianName}
        politicianSlug={politicianSlug}
        questionBody={questionBody}
      />
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-left"
      >
        + Write an answer to this question
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
      {error && <p className="text-xs text-destructive">{error}</p>}

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
          disabled={!isValid || isPending}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (uploadProgress ?? "Publishing…") : "Publish Answer"}
        </button>
      </div>
    </div>
  );
}
