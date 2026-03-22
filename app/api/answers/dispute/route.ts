/**
 * POST /api/answers/dispute
 *
 * Flags an AI-generated answer as disputed by the politician's team.
 * Sets is_disputed = true. Admin reviews within 48h per product rules.
 *
 * Body: { answer_id: string }
 * Auth: Supabase session + politician_team membership (any role)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as { answer_id?: string };
  if (!body.answer_id) {
    return NextResponse.json({ error: "answer_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch the answer to get politician_id and verify it's AI-generated
  const { data: answer } = await admin
    .from("answers")
    .select("id, politician_id, is_ai_generated, is_disputed")
    .eq("id", body.answer_id)
    .single();

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  if (!answer.is_ai_generated) {
    return NextResponse.json({ error: "Only AI-generated answers can be disputed" }, { status: 422 });
  }

  if (answer.is_disputed) {
    return NextResponse.json({ success: true, already_disputed: true });
  }

  // Verify the caller is on this politician's team
  const { data: membership } = await admin
    .from("politician_team")
    .select("role")
    .eq("politician_id", answer.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized for this politician" }, { status: 403 });
  }

  const { error } = await admin
    .from("answers")
    .update({ is_disputed: true })
    .eq("id", body.answer_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
