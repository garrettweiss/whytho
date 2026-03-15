import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  containsProfanity,
  exceedsSpamThreshold,
  SPAM_SAME_POLITICIAN_LIMIT,
  SPAM_WINDOW_HOURS,
} from "@/lib/moderation/filter";

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;
const DAILY_LIMIT = 5;

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    }
  );
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      politician_id: string;
      body: string;
      turnstile_token: string;
    };

    const { politician_id, body: questionBody, turnstile_token } = body;

    // ── Validate input ──────────────────────────────────────────────────────
    if (!politician_id || !questionBody || !turnstile_token) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const trimmed = questionBody.trim();
    if (trimmed.length < MIN_LENGTH) {
      return NextResponse.json(
        { error: `Question must be at least ${MIN_LENGTH} characters` },
        { status: 422 }
      );
    }
    if (trimmed.length > MAX_LENGTH) {
      return NextResponse.json(
        { error: `Question must be at most ${MAX_LENGTH} characters` },
        { status: 422 }
      );
    }

    // ── Profanity filter ─────────────────────────────────────────────────────
    if (containsProfanity(trimmed)) {
      return NextResponse.json(
        { error: "Question contains inappropriate language. Please revise and try again." },
        { status: 422 }
      );
    }

    // ── Turnstile verification ───────────────────────────────────────────────
    const valid = await verifyTurnstile(turnstile_token);
    if (!valid) {
      return NextResponse.json({ error: "Bot verification failed" }, { status: 403 });
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // ── Rate limit: 5 questions / user / 24h (global) ────────────────────────
    const { count: dailyCount } = await admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("submitted_by", user.id)
      .eq("is_seeded", false)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((dailyCount ?? 0) >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: `You can submit up to ${DAILY_LIMIT} questions per day` },
        { status: 429 }
      );
    }

    // ── Spam detection: max 3 questions per user per politician per 24h ───────
    const { count: politicianCount } = await admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("submitted_by", user.id)
      .eq("politician_id", politician_id)
      .eq("is_seeded", false)
      .gte(
        "created_at",
        new Date(Date.now() - SPAM_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
      );

    if (exceedsSpamThreshold(politicianCount ?? 0)) {
      return NextResponse.json(
        {
          error: `You can submit up to ${SPAM_SAME_POLITICIAN_LIMIT} questions per representative per day`,
        },
        { status: 429 }
      );
    }

    // ── Verify politician exists ─────────────────────────────────────────────
    const { data: politician } = await admin
      .from("politicians")
      .select("id")
      .eq("id", politician_id)
      .eq("is_active", true)
      .single();

    if (!politician) {
      return NextResponse.json({ error: "Politician not found" }, { status: 404 });
    }

    // ── Get current week number ───────────────────────────────────────────────
    const { data: weekData } = await admin.rpc("current_week_number");
    const week_number = weekData as number;

    // ── Insert question ───────────────────────────────────────────────────────
    const { data: question, error } = await admin
      .from("questions")
      .insert({
        politician_id,
        body: trimmed,
        submitted_by: user.id,
        week_number,
        is_seeded: false,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ question }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
