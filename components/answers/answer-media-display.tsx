"use client";

import { useState } from "react";

interface MediaItem {
  id: string;
  media_type: "image" | "video" | "audio";
  public_url: string;
  file_name: string | null;
}

interface Props {
  media: MediaItem[];
}

function ImageViewer({ item }: { item: MediaItem }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="block w-full rounded-lg overflow-hidden border border-muted hover:opacity-90 transition-opacity"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.public_url}
          alt={item.file_name ?? "Answer image"}
          className="w-full max-h-80 object-cover"
        />
      </button>
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.public_url}
            alt={item.file_name ?? "Answer image"}
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white text-2xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

export function AnswerMediaDisplay({ media }: Props) {
  if (!media || media.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      {media.map((item) => {
        if (item.media_type === "image") {
          return <ImageViewer key={item.id} item={item} />;
        }
        if (item.media_type === "video") {
          return (
            <video
              key={item.id}
              src={item.public_url}
              controls
              className="w-full rounded-lg border border-muted max-h-80 bg-black"
              preload="metadata"
            />
          );
        }
        if (item.media_type === "audio") {
          return (
            <div key={item.id} className="rounded-lg border border-muted bg-muted/30 px-3 py-2">
              {item.file_name && (
                <p className="text-xs text-muted-foreground mb-1.5 truncate">{item.file_name}</p>
              )}
              <audio
                src={item.public_url}
                controls
                className="w-full"
                preload="metadata"
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
