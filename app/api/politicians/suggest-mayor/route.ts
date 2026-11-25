import { NextResponse } from "next/server";
import { z } from "zod";
import { stateByCode } from "@/lib/search/states";
import { durableRateLimit, rateLimitKey } from "@/lib/security/durable-rate-limit";
import { safeOfficialUrl } from "@/lib/security/public-url";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const unavailable = { error: "Mayor suggestions are temporarily unavailable. Please try again." };
const suggestionSchema = z.object({
  name: z.string().trim().min(2).max(120).regex(/^[^\p{C}\p{Zl}\p{Zp}]+$/u),
  city: z.string().trim().min(2).max(120).regex(/^[^\p{C}\p{Zl}\p{Zp}]+$/u),
  state: z.string().refine((state) => stateByCode(state)?.code === state),
  source: z.string().trim().max(1000).transform((source, context) => {
    const url = safeOfficialUrl(source);
    if (url && url.href.length <= 1000) return url.href;
    context.addIssue({ code: "custom", message: "An official HTTPS link is required" });
    return z.NEVER;
  }),
  turnstile_token: z.string().min(1).max(2048),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return NextResponse.json({ error: "Sign in to suggest a mayor." }, { status: 401 });
    }

    const result = suggestionSchema.safeParse(await request.json().catch(() => null));
    if (!result.success) {
      return NextResponse.json({ error: "Enter the mayor’s name, city, state and an HTTPS link to their official city page." }, { status: 400 });
    }
    const { name, city, state, source, turnstile_token } = result.data;
    const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (!secret) return NextResponse.json(unavailable, { status: 503 });

    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: turnstile_token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!verification.ok) return NextResponse.json(unavailable, { status: 503 });
    const challenge = await verification.json();
    if (challenge?.success !== true || challenge.action !== "suggest-mayor") {
      return NextResponse.json({ error: "Security verification failed. Complete the check again." }, { status: 403 });
    }

    const limit = await durableRateLimit(rateLimitKey("suggest-mayor", user.id), 5, 86400);
    if (limit === "unavailable") return NextResponse.json(unavailable, { status: 503 });
    if (limit === "limited") {
      return NextResponse.json({ error: "You can suggest up to five mayors per day." }, { status: 429 });
    }

    // Keep suggestions private in the existing admin queue until the officeholder is reviewed.
    const { error } = await createAdminClient().from("chatbot_feedback").insert({
      category: "mayor_request",
      raw_message: `Mayor: ${name}\nCity: ${city}, ${state}\nOfficial source: ${source}`,
      user_id: user.id,
    });
    if (error) return NextResponse.json(unavailable, { status: 503 });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(unavailable, { status: 503 });
  }
}
