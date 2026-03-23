/**
 * GET /api/politicians/search-index
 *
 * Returns a lightweight index of all active politicians for client-side search caching.
 * Prefetched once after page load and cached in module memory — not called per-keystroke.
 *
 * Response is ~150KB gzipped for 6,600+ politicians.
 * Cache-Control: 1 hour at CDN, 2 hours stale-while-revalidate.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { STATES } from "@/lib/search/states";

// Build a full-name → 2-letter-code lookup once at module level.
// Federal politicians have state stored as full name ("California"),
// state-level politicians have the 2-letter code ("CA").
// Normalize everything to codes so search and region pages work uniformly.
const STATE_NAME_TO_CODE: Record<string, string> = {};
for (const s of STATES) {
  STATE_NAME_TO_CODE[s.name.toLowerCase()] = s.code;
}
function normalizeState(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase(); // already a code
  return STATE_NAME_TO_CODE[raw.toLowerCase()] ?? raw;
}

export const revalidate = 3600;

export type SearchIndexEntry = {
  n: string;        // full_name
  s: string;        // slug
  st: string | null; // state code e.g. "CO"
  o: string | null; // office
  p: string | null; // party
};

export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("politicians")
    .select("full_name, slug, state, office, party")
    .eq("is_active", true)
    .eq("is_test", false)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const index: SearchIndexEntry[] = (data ?? []).map((p) => ({
    n: p.full_name,
    s: p.slug,
    st: normalizeState(p.state),
    o: p.office,
    p: p.party,
  }));

  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
    },
  });
}
