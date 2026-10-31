"use client";

import { useRef } from "react";
import { safeAnswerMediaUrl } from "./media-url";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const imageDescription = item.file_name || "Image attached to this response";

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Open answer image: ${imageDescription}`}
        aria-haspopup="dialog"
        className="block w-full overflow-hidden border border-muted hover:opacity-90 transition-opacity motion-reduce:transition-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.public_url}
          alt={imageDescription}
          loading="lazy"
          className="w-full max-h-80 object-cover"
        />
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Expanded answer image"
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/90 p-4 text-white backdrop:bg-black/80 open:flex items-center justify-center"
        onClose={() => openerRef.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        onKeyDown={(event) => {
          // Native Escape closes the modal without also closing its answer panel.
          if (event.key === "Escape") event.stopPropagation();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.public_url}
          alt={imageDescription}
          className="max-h-[calc(100dvh-112px)] max-w-full object-contain"
        />
        <button
          type="button"
          autoFocus
          onClick={() => dialogRef.current?.close()}
          className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center border border-white bg-black text-2xl leading-none text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          aria-label="Close expanded answer image"
        >
          ×
        </button>
      </dialog>
    </>
  );
}

export function AnswerMediaDisplay({ media }: Props) {
  const safeMedia = (media ?? []).filter((item) => safeAnswerMediaUrl(item.public_url));
  if (safeMedia.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      {safeMedia.map((item) => {
        if (item.media_type === "image") {
          return <ImageViewer key={item.id} item={item} />;
        }
        if (item.media_type === "video") {
          return (
            <video
              key={item.id}
              src={item.public_url}
              aria-label={item.file_name || "Video attached to this response"}
              controls
              className="w-full border border-muted max-h-80 bg-black"
              preload="metadata"
            />
          );
        }
        if (item.media_type === "audio") {
          return (
            <div key={item.id} className="border border-muted px-3 py-2">
              {item.file_name && (
                <p className="text-xs text-muted-foreground mb-1.5 break-words">{item.file_name}</p>
              )}
              <audio
                src={item.public_url}
                aria-label={item.file_name || "Audio attached to this response"}
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
