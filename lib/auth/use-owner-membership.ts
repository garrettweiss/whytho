"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

interface OwnerMembership {
  isOwner: boolean;
  ownerRole: string | null;
}

const NONE: OwnerMembership = { isOwner: false, ownerRole: null };

/**
 * Whether the current user manages a given politician profile, and in what role.
 *
 * Resolved client-side on purpose. Doing this on the server required reading
 * cookies during the profile render, which forced the whole page dynamic and
 * defeated caching. RLS policy `team_own_read` limits the query to the user's
 * own membership rows.
 */
export function useOwnerMembership(
  politicianId: string,
  user: User | null | undefined
): OwnerMembership {
  const [membership, setMembership] = useState<OwnerMembership>(NONE);

  useEffect(() => {
    if (!user || user.is_anonymous) {
      setMembership(NONE);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    void supabase
      .from("politician_team")
      .select("role")
      .eq("politician_id", politicianId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setMembership(NONE);
          return;
        }
        setMembership({ isOwner: true, ownerRole: data.role ?? null });
      });

    return () => {
      cancelled = true;
    };
  // Keyed on user.id rather than the user object, which changes identity on
  // every auth event and would refetch needlessly. Same pattern as useIsPolitician.
  }, [politicianId, user?.id, user?.is_anonymous]); // eslint-disable-line react-hooks/exhaustive-deps

  return membership;
}
