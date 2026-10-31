/**
 * POST /api/answers/[id]/approve
 *
 * Approves a draft answer, making it live. Only team admins and editors
 * on a verified profile may approve. Responders cannot approve drafts.
 *
 * Auth: Supabase session + admin or editor role on politician_team
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
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

  const admin = createAdminClient();

  // Fetch the answer
  const { data: answer } = await admin
    .from("answers")
    .select("id, politician_id, is_ai_generated, is_draft, answer_type")
    .eq("id", id)
    .single();

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  if (!answer.is_draft) {
    return NextResponse.json({ error: "Answer is already published" }, { status: 409 });
  }

  if (answer.is_ai_generated || !["direct", "team_statement"].includes(answer.answer_type)) {
    return NextResponse.json({ error: "Only human response drafts can be approved" }, { status: 422 });
  }

  // Verify team membership — must be admin or editor
  const { data: membership } = await admin
    .from("politician_team")
    .select("role")
    .eq("politician_id", answer.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["admin", "editor"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Only team admins and editors can approve drafts" },
      { status: 403 }
    );
  }

  const { data: politician, error: politicianError } = await admin
    .from("politicians")
    .select("verification_tier")
    .eq("id", answer.politician_id)
    .single();
  if (politicianError || !politician) {
    return NextResponse.json({ error: "Could not confirm profile verification. Please try again." }, { status: 503 });
  }
  if (!["2", "3"].includes(politician.verification_tier)) {
    return NextResponse.json({ error: "Verify this profile's identity before publishing responses. This response remains a private draft." }, { status: 403 });
  }

  const { data: published, error: updateErr } = await admin
    .from("answers")
    .update({ is_draft: false })
    .eq("id", id)
    .eq("is_draft", true)
    .eq("is_ai_generated", false)
    .in("answer_type", ["direct", "team_statement"])
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!published) {
    return NextResponse.json({ error: "The response changed. Refresh before approving it." }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
