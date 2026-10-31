"use client";

import Link from "next/link";
import styles from "@/components/profile/profile.module.css";
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
    <div className={styles.notice}>
      <p >
        You are viewing your public profile.
      </p>
      <Link
        href="/dashboard"

      >
        Go to dashboard →
      </Link>
    </div>
  );
}
