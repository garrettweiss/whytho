import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION, validAssent } from "@/lib/auth/participation";
export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ accepted: false, account_required: true, terms_version: TERMS_VERSION }, { headers: { "Cache-Control": "private, no-store" } });
  const { data, error } = await client.rpc("has_current_participation_assent");
  if (error) return NextResponse.json({ error: "Could not verify participation eligibility." }, { status: 503 });
  return NextResponse.json({ accepted: data === true, terms_version: TERMS_VERSION }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: NextRequest) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in with an account first." }, { status: 401 });
  if (!validAssent(await request.json().catch(() => null))) return NextResponse.json({ error: "Affirm that you are 18 or older and accept the current Terms." }, { status: 400 });
  const { error } = await client.rpc("accept_participation_terms", { p_terms_version: TERMS_VERSION, p_adult: true });
  if (error) return NextResponse.json({ error: "Could not save your confirmation. Please retry." }, { status: 503 });
  return NextResponse.json({ accepted: true, terms_version: TERMS_VERSION }, { headers: { "Cache-Control": "private, no-store" } });
}
