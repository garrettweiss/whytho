import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { boundedJson } from "@/lib/security/bounded-json";
import { mutationRequestError } from "@/lib/security/request-policy";
import { validQuestionNoticeInput } from "@/lib/notifications/consent";

export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in to manage question emails." }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("get_politician_notification_preferences", { p_actor_id: user.id });
  if (error) return NextResponse.json({ error: "Question email settings are temporarily unavailable." }, { status: 503 });
  return NextResponse.json({ preferences: data, sending_enabled: false }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const originError = mutationRequestError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in to manage question emails." }, { status: 401 });
  const body = await boundedJson(request, 4096);
  if (!validQuestionNoticeInput(body)) return NextResponse.json({ error: "Choose a valid question email preference." }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("set_politician_notification_preference", {
    p_actor_id: user.id, p_politician_id: body.politician_id, p_mode: body.mode,
    p_timezone: body.mode === "daily" ? body.timezone : "UTC", p_consent_version: body.mode === "daily" ? body.consent_version : undefined,
  });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "A verified email and current verified office membership are required." : error.code === "22023" ? "Check the timezone and confirm the email preference." : "Question email settings are temporarily unavailable." }, { status: error.code === "42501" ? 403 : error.code === "22023" ? 422 : 503 });
  return NextResponse.json({ preference: data, sending_enabled: false }, { headers: { "Cache-Control": "private, no-store" } });
}
