"use client";

import Image from "next/image";
import { useState } from "react";

interface Props {
  photoUrl: string | null;
  fullName: string;
  size?: number; // px — used for both rendered size and sizes hint
  className?: string;
}

/**
 * Politician avatar with graceful fallback to initial letter when
 * the photo_url 404s, 403s, or hotlink-blocks.
 */
export function PoliticianAvatar({ photoUrl, fullName, size = 36, className = "" }: Props) {
  const [imgError, setImgError] = useState(false);
  const initial = fullName.slice(0, 1).toUpperCase();

  const containerClass = `relative overflow-hidden rounded-full border border-border shrink-0 ${className}`;
  const style = { width: size, height: size, minWidth: size };

  if (!photoUrl || imgError) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border border-border bg-muted text-muted-foreground font-bold shrink-0 ${className}`}
        style={{ ...style, fontSize: Math.max(10, Math.floor(size * 0.4)) }}
        aria-label={fullName}
      >
        {initial}
      </div>
    );
  }

  return (
    <div className={containerClass} style={style}>
      <Image
        src={photoUrl}
        alt={fullName}
        fill
        className="object-cover"
        sizes={`${size}px`}
        onError={() => setImgError(true)}
        unoptimized={photoUrl.startsWith("http://")}
      />
    </div>
  );
}
