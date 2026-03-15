/**
 * POST /api/questions/[id]/report
 *
 * Submits a user report on a question.
 * - One report per user per question (enforced by DB UNIQUE constraint)
 * - At 3 reports the DB trigger auto-sets question.status = 'removed'
 *
 * Body: { reason: "spam" | "offensive" | "off_topic" | "duplicate" | "other" }
 * Auth: Supabase session required
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const VALID_REASONS = ["spam", "offensive", "off_topic", "duplicate", "other"] as const;
type ReportReason = (typeof VALID_REASONS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: questionId } = await params;

  if (!questionId) {
    return NextResponse.json({ error: "Question ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as { reason?: string };
  const reason = body.reason as ReportReason | undefined;

  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json(
      { error: `reason must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify question exists and is active
  const { data: question } = await admin
    .from("questions")
    .select("id, status, submitted_by")
    .eq("id", questionId)
    .maybeSingle();

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  if (question.status !== "active") {
    return NextResponse.json(
      { error: "This question has already been removed" },
      { status: 422 }
    );
  }

  // Prevent self-reporting
  if (question.submitted_by === user.id) {
    return NextResponse.json(
      { error: "You cannot report your own question" },
      { status: 422 }
    );
  }

  // Insert report (UNIQUE constraint prevents duplicate reports from same user)
  const { error: insertErr } = await admin.from("question_reports").insert({
    question_id: questionId,
    user_id: user.id,
    reason,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Unique violation — already reported
      return NextResponse.json(
        { error: "You have already reported this question" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
