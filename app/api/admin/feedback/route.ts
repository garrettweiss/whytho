/**
 * PATCH /api/admin/feedback — Update chatbot feedback status
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest) {
  const { id, status, secret } = (await req.json()) as {
    id: string;
    status: string;
    secret: string;
  };

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validStatuses = ["new", "reviewed", "actioned", "dismissed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("chatbot_feedback")
    .update({ status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
