/**
 * POST /api/answers
 *
 * Submits an official answer to a qualifying question.
 * Requires the authenticated user to be on the politician's team.
 *
 * Body:
 *   {
 *     question_id: string,
 *     body: string,               // answer text (10-5000 chars)
 *     answer_type?: "direct" | "team_statement",  // default: role-dependent
 *     sources?: string[]          // optional source URLs
 *   }
 *
 * Role logic:
 *   admin  → may submit "direct" (politician's own voice) or "team_statement"
 *   editor → "team_statement" only
 *   responder → "team_statement" only
 *
 * Returns: { success: true, answer_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const MIN_BODY = 10;
const MAX_BODY = 5000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    question_id?: string;
    body?: string;
    answer_type?: string;
    sources?: string[];
  };

  if (!body.question_id) {
    return NextResponse.json({ error: "question_id is required" }, { status: 400 });
  }
  if (!body.body || typeof body.body !== "string") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const answerText = body.body.trim();
  if (answerText.length < MIN_BODY) {
    return NextResponse.json(
      { error: `Answer must be at least ${MIN_BODY} characters` },
      { status: 422 }
    );
  }
  if (answerText.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Answer must be at most ${MAX_BODY} characters` },
      { status: 422 }
    );
  }

  const admin = createAdminClient();

  // Fetch question to get politician_id and week_number
  const { data: question, error: qErr } = await admin
    .from("questions")
    .select("id, politician_id, week_number, net_upvotes, status")
    .eq("id", body.question_id)
    .single();

  if (qErr || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  if (question.status !== "active") {
    return NextResponse.json({ error: "Question is no longer active" }, { status: 422 });
  }

  // Check team membership + role
  const { data: membership } = await admin
    .from("politician_team")
    .select("role")
    .eq("politician_id", question.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "You are not authorized to answer for this politician" },
      { status: 403 }
    );
  }

  // Determine answer_type based on requested type + role
  const role = membership.role;
  let answerType: "direct" | "team_statement";

  if (body.answer_type === "direct") {
    if (role !== "admin") {
      return NextResponse.json(
        { error: "Only admin role can submit direct answers from the politician" },
        { status: 403 }
      );
    }
    answerType = "direct";
  } else {
    // Default: admin → direct, editor/responder → team_statement
    answerType = role === "admin" ? "direct" : "team_statement";
  }

  // Validate sources if provided
  const sources: string[] = [];
  if (Array.isArray(body.sources)) {
    for (const src of body.sources) {
      if (typeof src === "string" && src.trim().length > 0) {
        sources.push(src.trim());
      }
    }
  }

  // Idempotency: check if this politician already answered this question
  const { data: existing } = await admin
    .from("answers")
    .select("id")
    .eq("question_id", question.id)
    .in("answer_type", ["direct", "team_statement"])
    .eq("is_ai_generated", false)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "This question already has an official answer" },
      { status: 409 }
    );
  }

  // Insert answer
  const { data: answer, error: insertErr } = await admin
    .from("answers")
    .insert({
      question_id: question.id,
      politician_id: question.politician_id,
      week_number: question.week_number,
      answer_type: answerType,
      is_ai_generated: false,
      is_disputed: false,
      ai_confidence: null,
      body: answerText,
      sources: (sources.length > 0 ? sources : []) as unknown as Json,
      published_by: user.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    answer_id: answer?.id,
    answer_type: answerType,
  });
}
