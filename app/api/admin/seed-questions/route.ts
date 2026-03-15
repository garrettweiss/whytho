/**
 * POST /api/admin/seed-questions
 *
 * Admin-only endpoint to generate seeded questions for one or all politicians.
 * Requires ADMIN_SECRET header for authorization (no Supabase auth needed —
 * this is a backend-to-backend call from pg_notify handler or manual trigger).
 *
 * Body:
 *   { politician_id: string, week_number: number }  — single politician
 *   { all: true, week_number: number, limit?: number }  — batch (capped at 50/call)
 *
 * Each seeded question inserted with is_seeded=true.
 * Duplicate questions are skipped (haiku dedup check).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateSeededQuestions,
  isDuplicateQuestion,
  type PoliticianContext,
} from "@/lib/ai/seeded-questions";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MAX_BATCH = 50; // max politicians per single call

function isAuthorized(request: NextRequest): boolean {
  if (!ADMIN_SECRET) return false; // no secret configured → deny all
  const header = request.headers.get("x-admin-secret");
  return header === ADMIN_SECRET;
}

async function seedForPolitician(
  politician: PoliticianContext,
  weekNumber: number,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ inserted: number; skipped: number; error?: string }> {
  // Fetch existing questions this week to dedup against
  const { data: existing } = await supabase
    .from("questions")
    .select("body")
    .eq("politician_id", politician.id)
    .eq("week_number", weekNumber)
    .eq("status", "active");

  const existingBodies = (existing ?? []).map((q) => q.body);

  // Generate candidate questions
  let candidates;
  try {
    candidates = await generateSeededQuestions(politician, 12);
  } catch (err) {
    return {
      inserted: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : "Generation failed",
    };
  }

  let inserted = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    // Skip if semantically similar to an existing question
    const isDup = await isDuplicateQuestion(candidate.body, existingBodies).catch(() => false);
    if (isDup) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("questions").insert({
      politician_id: politician.id,
      body: candidate.body,
      week_number: weekNumber,
      is_seeded: true,
      status: "active",
      submitted_by: null, // system-generated
      net_upvotes: 0,
    });

    if (!error) {
      existingBodies.push(candidate.body); // prevent intra-batch dupes
      inserted++;
    }
  }

  return { inserted, skipped };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    politician_id?: string;
    all?: boolean;
    week_number: number;
    limit?: number;
  };

  if (!body.week_number || typeof body.week_number !== "number") {
    return NextResponse.json({ error: "week_number is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const results: Array<{
    politician_id: string;
    name: string;
    inserted: number;
    skipped: number;
    error?: string;
  }> = [];

  if (body.politician_id) {
    // Single politician
    const { data: politician } = await supabase
      .from("politicians")
      .select("id, full_name, office, state, party, bio, bioguide_id")
      .eq("id", body.politician_id)
      .eq("is_active", true)
      .single();

    if (!politician) {
      return NextResponse.json({ error: "Politician not found or inactive" }, { status: 404 });
    }

    const result = await seedForPolitician(politician, body.week_number, supabase);
    results.push({ politician_id: politician.id, name: politician.full_name, ...result });
  } else if (body.all === true) {
    // Batch — fetch politicians with no seeded questions this week yet
    const limit = Math.min(body.limit ?? MAX_BATCH, MAX_BATCH);

    const { data: politicians } = await supabase
      .from("politicians")
      .select("id, full_name, office, state, party, bio, bioguide_id")
      .eq("is_active", true)
      .not(
        "id",
        "in",
        `(SELECT DISTINCT politician_id FROM questions WHERE week_number = ${body.week_number} AND is_seeded = true)`
      )
      .limit(limit);

    for (const politician of politicians ?? []) {
      const result = await seedForPolitician(politician, body.week_number, supabase);
      results.push({ politician_id: politician.id, name: politician.full_name, ...result });
    }
  } else {
    return NextResponse.json(
      { error: "Provide either politician_id or all: true" },
      { status: 400 }
    );
  }

  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    success: true,
    week_number: body.week_number,
    politicians_processed: results.length,
    total_inserted: totalInserted,
    total_skipped: totalSkipped,
    errors: errors.length > 0 ? errors : undefined,
    results,
  });
}
