import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { claimWelcomeEmail } from "@/lib/email/templates";
import { durableRateLimit, rateLimitKey } from "@/lib/security/durable-rate-limit";
import { accountError, isUuid, readAccountBody } from "@/lib/accounts/request";

/** Atomically claim an unclaimed profile or resume the caller's existing claim. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await readAccountBody(request);
  if (!body || !isUuid(body.politician_id)) return NextResponse.json({ error: "A valid politician_id is required" }, { status: 400 });
  const { data: membership, error: membershipError } = await supabase.from("politician_team").select("role").eq("politician_id", body.politician_id).eq("user_id", user.id).maybeSingle();
  if (membershipError) return accountError(membershipError);
  if (!membership) {
    const limit = await durableRateLimit(rateLimitKey("profile-claim", user.id), 5, 3600);
    if (limit !== "allowed") return NextResponse.json({ error: limit === "limited" ? "Too many new claim attempts. Try again in an hour." : "Claim verification is temporarily unavailable." }, { status: limit === "limited" ? 429 : 503 });
  }
  const { data, error } = await createAdminClient().rpc("claim_politician_profile", { p_actor_id: user.id, p_politician_id: body.politician_id });
  if (error) return accountError(error);
  const claim = data as { resumed: boolean; politician_name: string; politician_slug: string };
  if (!claim.resumed && user.email) {
    try {
      const message = claimWelcomeEmail({ politicianName: claim.politician_name, politicianSlug: claim.politician_slug });
      await getResend().emails.send({ from: FROM_EMAIL, to: user.email, ...message });
    } catch { /* The saved claim remains resumable when email is unavailable. */ }
  }
  return NextResponse.json(data);
}
