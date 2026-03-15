/**
 * POST /api/admin/moderation
 *
 * Admin-only. Restore or permanently remove a flagged question.
 *
 * Headers: x-admin-secret: [ADMIN_SECRET]
 * Body: { question_id: string, action: "restore" | "remove" }
 *
 * restore → set status = 'active' (clears the auto-hide)
 * remove  → set status = 'removed' (already removed — confirms permanent)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function POST(request: NextRequest) {
  // Auth
  const secret = request.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    question_id?: string;
    action?: string;
  };

  if (!body.question_id) {
    return NextResponse.json({ error: "question_id is required" }, { status: 400 });
  }

  if (!body.action || !["restore", "remove"].includes(body.action)) {
    return NextResponse.json(
      { error: "action must be 'restore' or 'remove'" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const newStatus = body.action === "restore" ? "active" : "removed";

  const { error } = await admin
    .from("questions")
    .update({ status: newStatus })
    .eq("id", body.question_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: newStatus });
}
