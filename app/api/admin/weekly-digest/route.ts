/**
 * POST /api/admin/weekly-digest
 *
 * Sends the weekly digest email to all opted-in non-anonymous users.
 * Call this after weekly_reset() completes — typically right after Monday 05:00 UTC.
 *
 * Auth: x-admin-secret header
 *
 * Body: { week_number?: number }  — defaults to previous week
 *
 * Rate: Resend batch (100/call), multiple calls for large user bases.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL, SITE_URL } from "@/lib/email/resend";
import { weeklyDigestEmail } from "@/lib/email/templates";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const BATCH_SIZE = 100; // Resend batch limit

function isAuthorized(req: NextRequest): boolean {
  if (!ADMIN_SECRET) return false;
  return req.headers.get("x-admin-secret") === ADMIN_SECRET;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { week_number?: number };

  const admin = createAdminClient();

  // Determine which week to send digest for
  const { data: currentWeekData } = await admin.rpc("current_week_number");
  const currentWeek = currentWeekData as number;
  // Default to previous week (the one just completed)
  const targetWeek = body.week_number ?? currentWeek - 1;
  const year = Math.floor(targetWeek / 100);
  const week = targetWeek % 100;

  // Get weekly snapshots for this week (top performing politicians)
  const { data: snapshots } = await admin
    .from("weekly_snapshots")
    .select(
      "participation_rate, answered_qualifying, qualifying_questions, politicians!politician_id(full_name, slug)"
    )
    .eq("week_number", targetWeek)
    .not("politicians", "is", null)
    .gt("qualifying_questions", 0)
    .order("participation_rate", { ascending: false, nullsFirst: false })
    .limit(10);

  // Get top questions for this week
  const { data: topQuestions } = await admin
    .from("questions")
    .select("body, net_upvotes, politicians!politician_id(full_name, slug)")
    .eq("week_number", targetWeek)
    .eq("status", "active")
    .eq("is_seeded", false)
    .gte("net_upvotes", 5)
    .order("net_upvotes", { ascending: false })
    .limit(5);

  // Count total stats for this week
  const { count: totalQuestionsThisWeek } = await admin
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("week_number", targetWeek);

  const { count: totalAnswersThisWeek } = await admin
    .from("answers")
    .select("*", { count: "exact", head: true })
    .eq("week_number", targetWeek)
    .eq("is_ai_generated", false);

  // Get all opted-in non-anonymous users in batches
  // We query user_profiles for opted-in users, then look up their emails via auth
  const { data: optedInProfiles } = await admin
    .from("user_profiles")
    .select("id")
    .eq("notify_digest", true)
    .eq("is_anonymous", false)
    .limit(500); // safety cap for launch

  if (!optedInProfiles || optedInProfiles.length === 0) {
    return NextResponse.json({ success: true, sent: 0, message: "No opted-in users" });
  }

  const resend = getResend();
  let totalSent = 0;
  let totalFailed = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < optedInProfiles.length; i += BATCH_SIZE) {
    const batch = optedInProfiles.slice(i, i + BATCH_SIZE);

    // Look up emails for this batch
    const emailBatch: Array<{ from: string; to: string; subject: string; html: string; text: string }> = [];

    for (const profile of batch) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(profile.id);
        const email = userData?.user?.email;
        if (!email) continue;

        const { subject, html, text } = weeklyDigestEmail({
          year,
          week,
          totalQuestions: totalQuestionsThisWeek ?? 0,
          totalAnswers: totalAnswersThisWeek ?? 0,
          topPoliticians: (snapshots ?? []).slice(0, 3).map((s) => {
            const p = s.politicians as { full_name: string; slug: string } | null;
            return {
              name: p?.full_name ?? "—",
              slug: p?.slug ?? "",
              participationRate: s.participation_rate,
              answeredQualifying: s.answered_qualifying,
              qualifyingQuestions: s.qualifying_questions,
            };
          }),
          topQuestions: (topQuestions ?? []).slice(0, 3).map((q) => {
            const p = q.politicians as { full_name: string; slug: string } | null;
            return {
              body: q.body,
              netUpvotes: q.net_upvotes,
              politicianName: p?.full_name ?? "—",
              politicianSlug: p?.slug ?? "",
            };
          }),
        });

        emailBatch.push({ from: FROM_EMAIL, to: email, subject, html, text });
      } catch {
        totalFailed++;
      }
    }

    if (emailBatch.length === 0) continue;

    try {
      await resend.batch.send(emailBatch);
      totalSent += emailBatch.length;
    } catch {
      totalFailed += emailBatch.length;
    }
  }

  return NextResponse.json({
    success: true,
    week: targetWeek,
    sent: totalSent,
    failed: totalFailed,
    total_eligible: optedInProfiles.length,
  });
}
