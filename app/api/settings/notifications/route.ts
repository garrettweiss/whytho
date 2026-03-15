/**
 * PATCH /api/settings/notifications
 *
 * Update email notification preferences for the authenticated user.
 *
 * Body: { notify_answer?: boolean, notify_digest?: boolean }
 * Returns: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    notify_answer?: boolean;
    notify_digest?: boolean;
  };

  const update: { notify_answer?: boolean; notify_digest?: boolean } = {};

  if (typeof body.notify_answer === "boolean") {
    update.notify_answer = body.notify_answer;
  }
  if (typeof body.notify_digest === "boolean") {
    update.notify_digest = body.notify_digest;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Upsert — user_profiles may not exist yet for older accounts
  const { error } = await admin
    .from("user_profiles")
    .upsert({ id: user.id, ...update, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: prefs } = await supabase
    .from("user_profiles")
    .select("notify_answer, notify_digest")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    notify_answer: prefs?.notify_answer ?? true,
    notify_digest: prefs?.notify_digest ?? true,
  });
}
