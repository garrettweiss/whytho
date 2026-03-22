/**
 * POST /api/answers/[id]/approve
 *
 * Approves a draft answer, making it live. Only team admins and editors
 * may approve. Responders cannot approve their own drafts.
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
    .select("id, politician_id, is_ai_generated, is_draft, published_by")
    .eq("id", id)
    .single();

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  if (!answer.is_draft) {
    return NextResponse.json({ error: "Answer is already published" }, { status: 409 });
  }

  if (answer.is_ai_generated) {
    return NextResponse.json({ error: "AI answers cannot be approved via this endpoint" }, { status: 422 });
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

  // Responders cannot approve their own submissions
  if (answer.published_by === user.id && membership.role === "editor") {
    // editors can still approve (they could edit/submit themselves); only block responders
  }

  const { error: updateErr } = await admin
    .from("answers")
    .update({ is_draft: false })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
