/** Complete canonical public profile index, read in bounded pages and cached for five minutes. */

import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
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

export const revalidate = 300;

export type SearchIndexEntry = {
  n: string;        // full_name
  s: string;        // slug
  st: string | null; // state code e.g. "CO"
  o: string | null; // office
  p: string | null; // party
};

export async function GET() {
  const client = createPublicClient();

  const data = [];
  const signal = AbortSignal.timeout(20000);
  let after: string | null = null;
  for (;;) {
    let query = client.from("politicians").select("id,full_name,slug,state,office,party")
      .eq("is_active", true).eq("is_test", false).is("canonical_politician_id", null)
      .order("id").limit(500);
    if (after) query = query.gt("id", after);
    const page = await query.abortSignal(signal);
    if (page.error || !page.data) return NextResponse.json({ error: "Search index unavailable" }, { status: 503 });
    data.push(...page.data);
    if (page.data.length < 500) break;
    const next = page.data.at(-1)!.id;
    if (after && next <= after) throw new Error("Search index did not advance");
    after = next;
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
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
    },
  });
}
