import { NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ politicians: [] });
  if (q.length > 200) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  const { data, error } = await createPublicClient().rpc("search_politicians", {
    query: q, result_limit: 8,
  }).abortSignal(AbortSignal.timeout(8000));
  if (error || !data) return NextResponse.json({ error: "Politician search unavailable" }, { status: 503 });
  return NextResponse.json({ politicians: data });
}
