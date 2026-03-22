/**
 * POST /api/admin/politician-weekly-inbox
 *
 * Sends a weekly inbox summary to every politician team member.
 * Call after the weekly reset completes (Monday 05:00 UTC).
 *
 * Auth: x-admin-secret header
 * Body: { week_number?: number }  — defaults to current week
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { politicianWeeklyInboxEmail } from "@/lib/email/templates";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const QUALIFYING_THRESHOLD = 10;

function isAuthorized(req: NextRequest): boolean {
  if (!ADMIN_SECRET) return false;
  return req.headers.get("x-admin-secret") === ADMIN_SECRET;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const body = (await request.json().catch(() => ({}))) as { week_number?: number };

  // Resolve week number
  let weekNumber = body.week_number;
  if (!weekNumber) {
    const { data } = await admin.rpc("current_week_number");
    weekNumber = data as number;
  }

  // Fetch all politicians that have at least one team member
  const { data: teams } = await admin
    .from("politician_team")
    .select("politician_id, user_id");

  if (!teams?.length) {
    return NextResponse.json({ sent: 0, message: "No teams found" });
  }

  // Group team members by politician
  const byPolitician = new Map<string, string[]>();
  for (const row of teams) {
    const existing = byPolitician.get(row.politician_id) ?? [];
    existing.push(row.user_id);
    byPolitician.set(row.politician_id, existing);
  }

  const politicianIds = [...byPolitician.keys()];

  // Fetch politician details
  const { data: politicians } = await admin
    .from("politicians")
    .select("id, full_name, slug")
    .in("id", politicianIds)
    .eq("is_active", true);

  if (!politicians?.length) {
    return NextResponse.json({ sent: 0, message: "No active politicians with teams" });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const pol of politicians) {
    try {
      // Count qualifying questions for this week
      const { count: qualifyingCount } = await admin
        .from("questions")
        .select("*", { count: "exact", head: true })
        .eq("politician_id", pol.id)
        .eq("week_number", weekNumber)
        .eq("status", "active")
        .gte("net_upvotes", QUALIFYING_THRESHOLD);

      // Count unanswered qualifying questions
      const { data: qualifyingIds } = await admin
        .from("questions")
        .select("id")
        .eq("politician_id", pol.id)
        .eq("week_number", weekNumber)
        .eq("status", "active")
        .gte("net_upvotes", QUALIFYING_THRESHOLD);

      let unansweredCount = 0;
      if (qualifyingIds?.length) {
        const ids = qualifyingIds.map((q) => q.id);
        const { count: answeredCount } = await admin
          .from("answers")
          .select("*", { count: "exact", head: true })
          .in("question_id", ids)
          .in("answer_type", ["direct", "team_statement"])
          .eq("is_ai_generated", false);
        unansweredCount = (qualifyingIds.length) - (answeredCount ?? 0);
      }

      const { subject, html, text } = politicianWeeklyInboxEmail({
        politicianName: pol.full_name,
        politicianSlug: pol.slug,
        weekNumber: weekNumber!,
        qualifyingCount: qualifyingCount ?? 0,
        unansweredCount,
      });

      // Fetch team member emails and send
      const userIds = byPolitician.get(pol.id) ?? [];
      const emailPromises = userIds.map(async (uid) => {
        const { data } = await admin.auth.admin.getUserById(uid);
        return data?.user?.email ?? null;
      });
      const emails = (await Promise.all(emailPromises)).filter(Boolean) as string[];

      await Promise.all(
        emails.map((to) =>
          getResend().emails.send({ from: FROM_EMAIL, to, subject, html, text })
        )
      );
      sent += emails.length;
    } catch (err) {
      errors.push(`${pol.full_name}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    sent,
    politicians: politicians.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
