/**
 * POST /api/ai-analysis
 *
 * Triggers AI analysis for a question that has crossed the qualifying threshold
 * (net_upvotes >= 10). Idempotent — if analysis already exists, returns it.
 *
 * Authorization: x-admin-secret header (backend only — not called from the browser)
 *
 * Body: { question_id: string }
 *
 * Inserts into answers table with:
 *   answer_type: "ai_analysis"
 *   is_ai_generated: true
 *   ai_confidence: "high" | "medium" | "low" | "insufficient"
 *   body: analysis text (or empty string for insufficient)
 *   sources: JSON array
 *
 * PRODUCT RULE: Never label as from the politician.
 * Display label: "🤖 AI Analysis of Public Record. This is NOT a statement from [Politician]"
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateAnalysis } from "@/lib/ai/analysis";
import type { Json } from "@/types/database";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const QUALIFYING_THRESHOLD = 10; // net_upvotes >= this triggers analysis

function isAuthorized(request: NextRequest): boolean {
  if (!ADMIN_SECRET) return false;
  return request.headers.get("x-admin-secret") === ADMIN_SECRET;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { question_id?: string };
  if (!body.question_id) {
    return NextResponse.json({ error: "question_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch question + politician in one query
  const { data: question, error: qErr } = await supabase
    .from("questions")
    .select(`
      id,
      body,
      net_upvotes,
      week_number,
      politician_id,
      status,
      politicians (
        id,
        full_name,
        office,
        state,
        party,
        bio
      )
    `)
    .eq("id", body.question_id)
    .single();

  if (qErr || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  if (question.status !== "active") {
    return NextResponse.json({ error: "Question is not active" }, { status: 422 });
  }

  if (question.net_upvotes < QUALIFYING_THRESHOLD) {
    return NextResponse.json(
      {
        error: `Question has ${question.net_upvotes} votes; needs ${QUALIFYING_THRESHOLD} to qualify for AI analysis`,
      },
      { status: 422 }
    );
  }

  // Idempotency: check if analysis already exists for this question
  const { data: existingAnalysis } = await supabase
    .from("answers")
    .select("id, ai_confidence")
    .eq("question_id", question.id)
    .eq("answer_type", "ai_analysis")
    .eq("is_ai_generated", true)
    .maybeSingle();

  if (existingAnalysis) {
    return NextResponse.json({
      success: true,
      already_exists: true,
      answer_id: existingAnalysis.id,
      confidence: existingAnalysis.ai_confidence,
    });
  }

  const politician = Array.isArray(question.politicians)
    ? question.politicians[0]
    : question.politicians;

  if (!politician) {
    return NextResponse.json({ error: "Politician data not found" }, { status: 500 });
  }

  // Generate analysis
  let result;
  try {
    result = await generateAnalysis({
      politicianId: question.politician_id,
      politicianName: politician.full_name,
      office: politician.office,
      state: politician.state,
      party: politician.party,
      bio: politician.bio,
      question: question.body,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis generation failed" },
      { status: 500 }
    );
  }

  // Insert into answers table
  const { data: answer, error: insertErr } = await supabase
    .from("answers")
    .insert({
      question_id: question.id,
      politician_id: question.politician_id,
      week_number: question.week_number,
      answer_type: "ai_analysis",
      is_ai_generated: true,
      is_disputed: false,
      ai_confidence: result.confidence,
      body: result.insufficientRecord ? "" : result.body,
      sources: (result.insufficientRecord ? [] : result.sources) as unknown as Json,
      published_by: null, // system-generated
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    answer_id: answer?.id,
    confidence: result.confidence,
    insufficient: result.insufficientRecord,
  });
}
