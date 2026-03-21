/**
 * POST /api/admin/reset-test-politician
 *
 * Admin-only. Resets a test politician back to tier 0 (unclaimed).
 * Removes all politician_team entries and verification records.
 *
 * Only works on is_test=true politicians.
 *
 * Auth: Bearer ADMIN_SECRET header OR Supabase session with is_admin=true app_metadata
 * Body: { politician_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secretOk = ADMIN_SECRET && authHeader === `Bearer ${ADMIN_SECRET}`;

  if (!secretOk) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.is_admin !== true) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = (await request.json()) as { politician_id?: string };
  if (!body.politician_id) {
    return NextResponse.json({ error: "politician_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: politician, error: pErr } = await admin
    .from("politicians")
    .select("id, full_name, is_test")
    .eq("id", body.politician_id)
    .single();

  if (pErr || !politician) {
    return NextResponse.json({ error: "Politician not found" }, { status: 404 });
  }

  if (!politician.is_test) {
    return NextResponse.json(
      { error: "reset only works on is_test=true politicians" },
      { status: 422 }
    );
  }

  // Remove team members
  await admin.from("politician_team").delete().eq("politician_id", body.politician_id);

  // Remove verification records
  await admin.from("politician_verifications").delete().eq("politician_id", body.politician_id);

  // Reset to tier 0
  const { error: tierErr } = await admin
    .from("politicians")
    .update({ verification_tier: "0" })
    .eq("id", body.politician_id);

  if (tierErr) {
    return NextResponse.json({ error: tierErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    politician_id: body.politician_id,
    politician_name: politician.full_name,
    verification_tier: 0,
    message: "Reset to tier 0. Ready to re-test the claim flow.",
  });
}
