/** Complete canonical public profile index, read in bounded pages and cached for five minutes. */

import { NextResponse } from "next/server";
import { loadPoliticianIndex } from "@/lib/search/politician-index.server";
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
  try {
    const rows = await loadPoliticianIndex();
    const index: SearchIndexEntry[] = rows.map(([, name, slug, state, office, party]) => ({
      n: name,
      s: slug,
      st: normalizeState(state),
      o: office,
      p: party,
    }));
    return NextResponse.json(index, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ error: "Search index unavailable" }, { status: 503 });
  }
}
