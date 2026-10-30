"use client";

import Link from "next/link";
import { useUser } from "@/lib/auth/use-user";
import { useOwnerMembership } from "@/lib/auth/use-owner-membership";

/**
 * "You are viewing your public profile" notice for team members.
 *
 * Client-rendered so the profile page can be served from cache: the page HTML
 * is identical for every visitor, and this component adds the personal touch
 * after hydration for the handful of people it applies to.
 */
export function OwnerBanner({ politicianId }: { politicianId: string }) {
  const { user } = useUser();
  const { isOwner } = useOwnerMembership(politicianId, user);

  if (!isOwner) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
        You are viewing your public profile.
      </p>
      <Link
        href="/dashboard"
        className="shrink-0 text-sm font-medium text-blue-700 dark:text-blue-400 underline underline-offset-2 hover:no-underline"
      >
        Go to Dashboard →
      </Link>
    </div>
  );
}
