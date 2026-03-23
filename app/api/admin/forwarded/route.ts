/**
 * PATCH /api/admin/forwarded — Save team answer to a forwarded question
 * When published=true, the DB trigger auto-inserts into chatbot_knowledge.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest) {
  const { id, team_answer, published, secret } = (await req.json()) as {
    id: string;
    team_answer: string;
    published: boolean;
    secret: string;
  };

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!team_answer?.trim()) {
    return NextResponse.json({ error: "Answer is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("chatbot_forwarded")
    .update({ team_answer: team_answer.trim(), published: published ?? false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
