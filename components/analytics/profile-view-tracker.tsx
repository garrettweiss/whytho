"use client";

import { useEffect } from "react";
import { posthog } from "@/lib/analytics/posthog-client";

interface Props {
  slug: string;
  politicianId: string;
  office: string | null;
  state: string | null;
  verificationTier: string;
}

/**
 * Fires a `politician_profile_viewed` PostHog event once on mount.
 * Used in the SSR politician profile page via a lightweight client island.
 */
export function ProfileViewTracker({ slug, politicianId, office, state, verificationTier }: Props) {
  useEffect(() => {
    posthog.capture("politician_profile_viewed", {
      slug,
      politician_id: politicianId,
      office,
      state,
      verification_tier: verificationTier,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
