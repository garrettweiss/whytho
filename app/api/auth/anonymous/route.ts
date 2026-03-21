/**
 * POST /api/auth/anonymous
 *
 * Server-side anonymous session creation with IP-based rate limiting.
 * Prevents anonymous session farming (clear cookies → new session → re-vote).
 *
 * Limit: 10 anonymous sessions per IP per hour.
 * This is generous enough for legitimate use (shared IPs, NAT) but blocks
 * automated fraud bots.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

const MAX_ANON_SESSIONS_PER_HOUR = 10;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // ── IP rate limit ─────────────────────────────────────────────────────────
  // Count anonymous accounts created from this IP in the last hour.
  // We store this in a lightweight table to avoid external Redis dependency.
  const admin = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: recentSessions } = await admin
    .from("anon_session_log")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", oneHourAgo);

  if ((recentSessions ?? 0) >= MAX_ANON_SESSIONS_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  // ── Create anonymous session ──────────────────────────────────────────────
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error || !data.user) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }

  // ── Log the new anonymous session for rate limiting ───────────────────────
  // Fire-and-forget — don't block on this
  void admin
    .from("anon_session_log")
    .insert({ ip_address: ip, user_id: data.user.id })
    .then(() => {});

  return NextResponse.json({ success: true });
}
