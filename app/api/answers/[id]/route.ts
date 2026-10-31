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

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !("body" in body) || typeof body.body !== "string") {
    return NextResponse.json({ error: "body must be a string" }, { status: 422 });
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

  // Fetch the answer
  const { data: answer } = await admin
    .from("answers")
    .select("id, politician_id, is_ai_generated, answer_type, is_draft, created_at, published_by")
    .eq("id", id)
    .single();

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  if (answer.is_ai_generated || !["direct", "team_statement"].includes(answer.answer_type)) {
    return NextResponse.json({ error: "Only human official responses can be edited" }, { status: 422 });
  }

  // Enforce 15-minute edit window
  const createdAt = new Date(answer.created_at as string).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > EDIT_WINDOW_MS) {
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

  const canPublish = membership && ["admin", "editor"].includes(membership.role);
  const ownsDraft = membership?.role === "responder" && answer.is_draft && answer.published_by === user.id;
  if (!canPublish && !ownsDraft) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: politician, error: politicianError } = await admin.from("politicians")
    .select("verification_tier").eq("id", answer.politician_id).maybeSingle();
  if (politicianError || !politician) {
    return NextResponse.json({ error: "Profile verification could not be confirmed" }, { status: 503 });
  }
  const isVerified = ["2", "3"].includes(politician.verification_tier);
  if (!isVerified && !answer.is_draft) {
    return NextResponse.json({ error: "Verify this profile before editing a published official response" }, { status: 403 });
  }

  let update = admin
    .from("answers")
    .update({ body: answerText })
    .eq("id", id)
    .eq("politician_id", answer.politician_id)
    .eq("is_ai_generated", false)
    .in("answer_type", ["direct", "team_statement"]);

  // Keep these conditions on the write itself: approval can happen after the read.
  if (membership?.role === "responder") update = update.eq("is_draft", true).eq("published_by", user.id);
  else if (!isVerified) update = update.eq("is_draft", true);
  const { data: updated, error: updateErr } = await update.select("id").maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "The response status changed. Refresh before editing again." }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
