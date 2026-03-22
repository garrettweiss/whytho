/**
 * POST /api/verify/claim
 *
 * Claims an unclaimed (tier 0) politician profile.
 * - Adds authenticated user to politician_team as admin
 * - Upgrades politician.verification_tier from "0" → "1"
 *
 * Body: { politician_id: string }
 * Auth: Supabase session (non-anonymous)
 *
 * Returns: { success: true, politician_id, politician_name, verification_tier: 1 }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { claimWelcomeEmail } from "@/lib/email/templates";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as { politician_id?: string };
  if (!body.politician_id) {
    return NextResponse.json({ error: "politician_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch politician — must exist and be tier 0
  const { data: politician, error: pErr } = await admin
    .from("politicians")
    .select("id, full_name, verification_tier")
    .eq("id", body.politician_id)
    .eq("is_active", true)
    .single();

  if (pErr || !politician) {
    return NextResponse.json({ error: "Politician not found" }, { status: 404 });
  }

  if (politician.verification_tier !== "0") {
    return NextResponse.json(
      { error: "This profile has already been claimed" },
      { status: 409 }
    );
  }

  // Check user isn't already on this politician's team
  const { data: existingMembership } = await admin
    .from("politician_team")
    .select("id")
    .eq("politician_id", body.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json(
      { error: "You have already claimed this profile" },
      { status: 409 }
    );
  }

  // Add to politician_team as admin
  const { error: teamErr } = await admin.from("politician_team").insert({
    politician_id: body.politician_id,
    user_id: user.id,
    role: "admin",
    invited_by: user.id,
  });

  if (teamErr) {
    return NextResponse.json({ error: teamErr.message }, { status: 500 });
  }

  // Upgrade verification_tier to 1 (self-claimed)
  const { error: tierErr } = await admin
    .from("politicians")
    .update({ verification_tier: "1" })
    .eq("id", body.politician_id);

  if (tierErr) {
    return NextResponse.json({ error: tierErr.message }, { status: 500 });
  }

  // Fire-and-forget: send welcome email to the claimer
  void (async () => {
    try {
      const email = user.email;
      if (!email) return;
      const { data: pol } = await admin
        .from("politicians")
        .select("slug")
        .eq("id", body.politician_id!)
        .single();
      if (!pol) return;
      const { subject, html, text } = claimWelcomeEmail({
        politicianName: politician.full_name,
        politicianSlug: pol.slug,
      });
      await getResend().emails.send({ from: FROM_EMAIL, to: email, subject, html, text });
    } catch {
      // Never let email errors affect the API response
    }
  })();

  return NextResponse.json({
    success: true,
    politician_id: body.politician_id,
    politician_name: politician.full_name,
    verification_tier: 1,
  });
}
