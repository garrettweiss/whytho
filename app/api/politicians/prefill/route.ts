/**
 * GET /api/politicians/prefill?id=<politician_id>
 *
 * Returns politician data by ID, including is_test politicians.
 * Used by the verify wizard when navigating from the admin test-accounts page.
 *
 * Auth: Supabase session with is_admin=true app_metadata required.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.is_admin !== true) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: politician, error } = await admin
    .from("politicians")
    .select("id, slug, full_name, office, state, party, photo_url, is_test")
    .eq("id", id)
    .single();

  if (error || !politician) {
    return NextResponse.json({ error: "Politician not found" }, { status: 404 });
  }

  return NextResponse.json({ politician });
}
