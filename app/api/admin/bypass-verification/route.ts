/**
 * POST /api/admin/bypass-verification
 *
 * Admin-only. Directly upgrades a test politician to verification_tier 2,
 * bypassing gov-email and meta-tag verification flows.
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
  // Accept either admin secret header or is_admin session
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

  // Must be a test politician
  const { data: politician, error: pErr } = await admin
    .from("politicians")
    .select("id, full_name, verification_tier, is_test")
    .eq("id", body.politician_id)
    .single();

  if (pErr || !politician) {
    return NextResponse.json({ error: "Politician not found" }, { status: 404 });
  }

  if (!politician.is_test) {
    return NextResponse.json(
      { error: "bypass-verification only works on is_test=true politicians" },
      { status: 422 }
    );
  }

  // Directly set tier 2
  const { error: tierErr } = await admin
    .from("politicians")
    .update({ verification_tier: "2" })
    .eq("id", body.politician_id);

  if (tierErr) {
    return NextResponse.json({ error: tierErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    politician_id: body.politician_id,
    politician_name: politician.full_name,
    verification_tier: 2,
  });
}
