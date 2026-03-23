"use client";

import { useState } from "react";

interface Props {
  answerId: string;
  politicianName: string;
  politicianSlug: string;
  questionBody: string;
}

export function ShareTray({ answerId, politicianName, politicianSlug, questionBody }: Props) {
  const [cardDownloaded, setCardDownloaded] = useState(false);

  const siteUrl = "https://whytho.us";
  const answerUrl = `${siteUrl}/${politicianSlug}#answer-${answerId}`;
  const shareText = `${politicianName} answered a constituent question on WhyTho: "${questionBody.slice(0, 80)}${questionBody.length > 80 ? "…" : ""}"`;

  const xShareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(answerUrl)}`;
  const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(answerUrl)}`;
  const cardUrl = `/api/og/answer/${answerId}`;

  async function handleDownloadCard() {
    try {
      const res = await fetch(cardUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `whytho-answer-${answerId}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setCardDownloaded(true);
    } catch {
      // fallback: open in new tab
      window.open(cardUrl, "_blank");
    }
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-4 py-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
          ✓ Answer published!
        </p>
        <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
          Share your response to reach more constituents.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={xShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-green-300 dark:border-green-700 bg-white dark:bg-green-900/30 px-3 py-1.5 text-xs font-medium text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
        >
          Share on X
        </a>
        <a
          href={fbShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-green-300 dark:border-green-700 bg-white dark:bg-green-900/30 px-3 py-1.5 text-xs font-medium text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
        >
          Share on Facebook
        </a>
        <button
          type="button"
          onClick={handleDownloadCard}
          className="inline-flex items-center gap-1.5 rounded-md border border-green-300 dark:border-green-700 bg-white dark:bg-green-900/30 px-3 py-1.5 text-xs font-medium text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
        >
          {cardDownloaded ? "✓ Card saved" : "Download card (Instagram/TikTok)"}
        </button>
      </div>
      <p className="text-xs text-green-600 dark:text-green-500">
        The card image works for Instagram, TikTok, or anywhere you post.
      </p>
    </div>
  );
}
