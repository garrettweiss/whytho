/**
 * PATCH /api/admin/races/candidate-status
 * Mark a candidate as won / lost / active
 *
 * Body: { secret, candidateId, raceId, status: 'won' | 'lost' | 'active' }
 *
 * - won: candidate_status='won', politician_type='elected', is_active=true
 * - lost: candidate_status='lost', is_active=false
 * - active: reset to candidate_status='active', is_active=true
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const VALID_STATUSES = ["won", "lost", "active", "withdrew"] as const;
type CandidateStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { secret, candidateId, raceId, status } = body as {
    secret?: string;
    candidateId?: string;
    raceId?: string;
    status?: string;
  };

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!candidateId || !raceId || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status as CandidateStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // Verify candidate belongs to this race
  const { data: candidate } = await supabase
    .from("politicians")
    .select("id, politician_type, full_name")
    .eq("id", candidateId)
    .eq("race_id", raceId)
    .maybeSingle();

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found in this race" }, { status: 404 });
  }

  const update: Record<string, unknown> = { candidate_status: status };

  if (status === "won") {
    // Winner becomes elected official
    update.politician_type = "elected";
    update.is_active = true;
  } else if (status === "lost" || status === "withdrew") {
    // Loser is hidden but preserved
    update.is_active = false;
  } else if (status === "active") {
    // Reset
    update.politician_type = "candidate";
    update.is_active = true;
  }

  const { error } = await supabase
    .from("politicians")
    .update(update)
    .eq("id", candidateId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    candidateId,
    newStatus: status,
    politician_type: update.politician_type ?? candidate.politician_type,
  });
}
