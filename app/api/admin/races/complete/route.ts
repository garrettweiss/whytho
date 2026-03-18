/**
 * PATCH /api/admin/races/complete
 * Mark a race as completed
 *
 * Body: { secret, raceId }
 *
 * Effects:
 * - race.status = 'completed'
 * - Any candidates still in 'active' status are set to is_active=false
 *   (ensures only winner remains visible — winner should be marked first)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { secret, raceId } = body as { secret?: string; raceId?: string };

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!raceId) {
    return NextResponse.json({ error: "Missing raceId" }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // Verify race exists
  const { data: race } = await supabase
    .from("races")
    .select("id, name, status")
    .eq("id", raceId)
    .maybeSingle();

  if (!race) {
    return NextResponse.json({ error: "Race not found" }, { status: 404 });
  }

  // Mark race completed
  const { error: raceError } = await supabase
    .from("races")
    .update({ status: "completed" })
    .eq("id", raceId);

  if (raceError) {
    return NextResponse.json({ error: raceError.message }, { status: 500 });
  }

  // Hide any remaining active candidates (those not marked won)
  const { data: remaining, error: candidateError } = await supabase
    .from("politicians")
    .update({ is_active: false, candidate_status: "lost" })
    .eq("race_id", raceId)
    .eq("politician_type", "candidate")
    .eq("candidate_status", "active")
    .select("id");

  if (candidateError) {
    console.error("Error hiding remaining candidates:", candidateError.message);
  }

  return NextResponse.json({
    success: true,
    raceId,
    raceName: race.name,
    hiddenCandidates: remaining?.length ?? 0,
  });
}
