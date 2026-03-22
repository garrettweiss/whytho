/**
 * PATCH /api/answers/[id]
 *
 * Allows a politician team member to edit an official answer within 15 minutes
 * of it being submitted.
 *
 * Body: { body: string }
 * Auth: Supabase session + politician_team membership
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MIN_BODY = 10;
const MAX_BODY = 5000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as { body?: string };
  const answerText = (body.body ?? "").trim();

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

  // Fetch the answer
  const { data: answer } = await admin
    .from("answers")
    .select("id, politician_id, is_ai_generated, created_at, published_by")
    .eq("id", id)
    .single();

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  if (answer.is_ai_generated) {
    return NextResponse.json({ error: "AI-generated answers cannot be edited" }, { status: 422 });
  }

  // Enforce 15-minute edit window
  const createdAt = new Date(answer.created_at as string).getTime();
  if (Date.now() - createdAt > EDIT_WINDOW_MS) {
    return NextResponse.json(
      { error: "Edit window has closed. Answers can only be edited within 15 minutes of submission." },
      { status: 422 }
    );
  }

  // Verify team membership
  const { data: membership } = await admin
    .from("politician_team")
    .select("role")
    .eq("politician_id", answer.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error: updateErr } = await admin
    .from("answers")
    .update({ body: answerText })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
