"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Returns whether the current user is a member of any politician team.
 * Used to conditionally show politician-specific nav items (Dashboard, Claim profile).
 */
export function useIsPolitician(user: User | null | undefined): boolean | null {
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || user.is_anonymous) {
      setIsMember(false);
      return;
    }

    const supabase = createClient();
    void supabase
      .from("politician_team")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count, error }) => {
        if (error) { setIsMember(false); return; }
        setIsMember((count ?? 0) > 0);
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return isMember;
}
