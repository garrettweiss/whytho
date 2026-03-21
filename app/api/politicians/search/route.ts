import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ politicians: [] });
  }

  const supabase = createAdminClient();

  // Layer 1: ILIKE prefix match (fast, catches exact name starts)
  const { data: prefixResults } = await supabase
    .from("politicians")
    .select("id, slug, full_name, office, state, party, photo_url")
    .eq("is_active", true)
    .eq("is_test", false)
    .ilike("full_name", `%${q}%`)
    .order("state", { ascending: true })
    .limit(8);

  if ((prefixResults ?? []).length >= 5) {
    return NextResponse.json({ politicians: prefixResults ?? [] });
  }

  // Layer 2: pg_trgm similarity — catches typos and partial matches
  // Use word_similarity for better partial matching
  const { data: trgmResults } = await supabase.rpc("search_politicians", {
    query: q,
    result_limit: 8,
  });

  // Merge, deduplicate by id, prefix match first — exclude test politicians
  const seen = new Set((prefixResults ?? []).map((p) => p.id));
  const merged = [
    ...(prefixResults ?? []),
    ...(trgmResults ?? []).filter((p: { id: string; is_test?: boolean }) => !seen.has(p.id) && !p.is_test),
  ].slice(0, 8);

  return NextResponse.json({ politicians: merged });
}
