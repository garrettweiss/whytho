"use client";

import { useEffect } from "react";

export function canonicalProfileDestination(currentHref: string, canonicalSlug: string): string {
  if (!canonicalSlug || canonicalSlug.length > 200 || /[\u0000-\u0020\u007f/\\?#]/.test(canonicalSlug)) throw new Error("Invalid canonical profile URL");
  const destination = new URL(currentHref);
  destination.pathname = `/${encodeURIComponent(canonicalSlug)}`;
  return destination.href;
}

/** Fragments never reach the server. Preserve them before changing the URL. */
export function CanonicalProfileRedirect({ slug }: { slug: string }) {
  useEffect(() => {
    const destination = canonicalProfileDestination(window.location.href, slug);
    if (destination !== window.location.href) window.location.replace(destination);
  }, [slug]);
  return null;
}
