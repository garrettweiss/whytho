/**
 * /admin/metrics: Core WhyTho metrics dashboard
 *
 * Auth: ?secret=ADMIN_SECRET query param (same as main admin)
 * Shows: user growth, question breakdown, participation trends, fraud watch
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

interface Props {
  searchParams: Promise<{ secret?: string }>;
}

function StatCard({
  label,
  value,
  sub,
  delta,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  color?: "green" | "red" | "yellow" | "blue";
}) {
  const colorClass =
    color === "green"
      ? "text-green-600 dark:text-green-400"
      : color === "red"
        ? "text-red-600 dark:text-red-400"
        : color === "yellow"
          ? "text-yellow-600 dark:text-yellow-400"
          : color === "blue"
            ? "text-blue-600 dark:text-blue-400"
            : "text-foreground";

  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {delta && <p className="text-xs font-medium text-muted-foreground">{delta}</p>}
    </div>
  );
}

export default async function MetricsDashboard({ searchParams }: Props) {
  const { secret } = await searchParams;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    redirect("/");
  }

  const admin = createAdminClient();

  const { data: weekData } = await admin.rpc("current_week_number");
  const currentWeek = weekData as number;
  const year = Math.floor(currentWeek / 100);
  const week = currentWeek % 100;

  // Date boundaries
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  weekStart.setHours(0, 0, 0, 0);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(weekStart.getDate() - 7);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStartIso = weekStart.toISOString();
  const prevWeekStartIso = prevWeekStart.toISOString();
  const todayStartIso = todayStart.toISOString();

  // Parallel queries
  const [
    // User growth
    { count: totalUsers },
    { count: newUsersThisWeek },
    { count: newUsersPrevWeek },

    // Engagement this week (data used for client-side deduplication)
    { data: activeVotersThisWeek },
    { data: activeSubmittersThisWeek },
    { count: totalVotesThisWeek },

    // Questions breakdown this week
    { count: organicQsThisWeek },
    { count: seededQsThisWeek },
    { count: xQsThisWeek },

    // Questions prev week (for delta)
    { count: organicQsPrevWeek },

    // All-time
    { count: totalVotesAllTime },
    { count: totalQuestionsAllTime },

    // Politicians with questions this week (data used for dedup)
    { data: activePoliticiansThisWeek },

    // Top questions this week
    { data: topQuestions },

    // Fraud watch: top voters today
    { data: topVotersToday },

    // Recent signups
    { data: recentUsers },
  ] = await Promise.all([
    // Total users
    admin.from("user_profiles").select("*", { count: "exact", head: true }),

    // New users this week
    admin
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartIso),

    // New users prev week
    admin
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", prevWeekStartIso)
      .lt("created_at", weekStartIso),

    // Unique voters this week
    admin
      .from("votes")
      .select("user_id", { count: "exact", head: false })
      .gte("created_at", weekStartIso),

    // Unique question submitters this week (non-seeded, non-x)
    admin
      .from("questions")
      .select("submitted_by", { count: "exact", head: false })
      .gte("created_at", weekStartIso)
      .eq("is_seeded", false)
      .not("submitted_by", "is", null),

    // Total votes this week
    admin
      .from("votes")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartIso),

    // Organic questions this week
    admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("week_number", currentWeek)
      .eq("is_seeded", false)
      .neq("source", "x")
      .eq("status", "active"),

    // Seeded questions this week
    admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("week_number", currentWeek)
      .eq("is_seeded", true)
      .eq("status", "active"),

    // X-sourced questions this week
    admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("week_number", currentWeek)
      .eq("source", "x")
      .eq("status", "active"),

    // Organic questions prev week (for delta)
    admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("week_number", currentWeek - 1)
      .eq("is_seeded", false)
      .neq("source", "x")
      .eq("status", "active"),

    // Total votes all time
    admin.from("votes").select("*", { count: "exact", head: true }),

    // Total questions all time
    admin.from("questions").select("*", { count: "exact", head: true }).eq("status", "active"),

    // Politicians who got at least one question this week
    admin
      .from("questions")
      .select("politician_id", { count: "exact", head: false })
      .eq("week_number", currentWeek)
      .eq("status", "active"),

    // Top 10 questions this week by net_upvotes
    admin
      .from("questions")
      .select("id, body, net_upvotes, is_seeded, source, politicians!politician_id(full_name, slug)")
      .eq("week_number", currentWeek)
      .eq("status", "active")
      .order("net_upvotes", { ascending: false })
      .limit(10),

    // Fraud watch: top voters today (raw — dedupe client side)
    admin
      .from("votes")
      .select("user_id, created_at")
      .gte("created_at", todayStartIso)
      .order("created_at", { ascending: false })
      .limit(500),

    // Recent signups (last 10)
    admin
      .from("user_profiles")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Dedupe active voters / submitters (Supabase doesn't do COUNT DISTINCT in one call)
  const uniqueVoterCount = new Set((activeVotersThisWeek ?? []).map((v) => v.user_id)).size;
  const uniqueSubmitterCount = new Set((activeSubmittersThisWeek ?? []).map((q) => q.submitted_by)).size;
  const uniqueActivePoliticians = new Set((activePoliticiansThisWeek ?? []).map((q) => q.politician_id)).size;

  // Fraud watch: aggregate today's votes per user
  const votesByUser: Record<string, number> = {};
  for (const v of topVotersToday ?? []) {
    if (v.user_id) votesByUser[v.user_id] = (votesByUser[v.user_id] ?? 0) + 1;
  }
  const fraudWatch = Object.entries(votesByUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const secretParam = `?secret=${secret}`;

  // Growth delta
  const newUsersDelta =
    (newUsersPrevWeek ?? 0) > 0
      ? `${(newUsersThisWeek ?? 0) >= (newUsersPrevWeek ?? 0) ? "+" : ""}${(newUsersThisWeek ?? 0) - (newUsersPrevWeek ?? 0)} vs last week`
      : undefined;

  const organicDelta =
    (organicQsPrevWeek ?? 0) > 0
      ? `${(organicQsThisWeek ?? 0) >= (organicQsPrevWeek ?? 0) ? "+" : ""}${(organicQsThisWeek ?? 0) - (organicQsPrevWeek ?? 0)} vs last week`
      : undefined;

  const totalQsThisWeek = (organicQsThisWeek ?? 0) + (seededQsThisWeek ?? 0) + (xQsThisWeek ?? 0);
  const organicPct = totalQsThisWeek > 0
    ? Math.round(((organicQsThisWeek ?? 0) / totalQsThisWeek) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Metrics Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Week {week}, {year} · Core WhyTho health
            </p>
          </div>
          <Link
            href={`/admin${secretParam}`}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            ← Admin
          </Link>
        </div>

        {/* User Growth */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            User Growth
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Users" value={(totalUsers ?? 0).toLocaleString()} sub="all time" />
            <StatCard
              label="New This Week"
              value={(newUsersThisWeek ?? 0).toLocaleString()}
              sub={`W${week}`}
              delta={newUsersDelta}
              color="blue"
            />
            <StatCard
              label="Active Voters"
              value={uniqueVoterCount.toLocaleString()}
              sub="unique this week"
              color="green"
            />
            <StatCard
              label="Active Submitters"
              value={uniqueSubmitterCount.toLocaleString()}
              sub="posted questions this week"
            />
          </div>
        </div>

        {/* Question Breakdown */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Questions This Week
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total"
              value={totalQsThisWeek.toLocaleString()}
              sub={`W${week} active`}
            />
            <StatCard
              label="Organic"
              value={(organicQsThisWeek ?? 0).toLocaleString()}
              sub={`${organicPct}% of total`}
              delta={organicDelta}
              color="green"
            />
            <StatCard
              label="Seeded (AI)"
              value={(seededQsThisWeek ?? 0).toLocaleString()}
              sub="AI-generated"
              color="yellow"
            />
            <StatCard
              label="From X"
              value={(xQsThisWeek ?? 0).toLocaleString()}
              sub="Jack pipeline"
              color="blue"
            />
          </div>
        </div>

        {/* Engagement */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Engagement
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Votes This Week"
              value={(totalVotesThisWeek ?? 0).toLocaleString()}
              sub={`W${week}`}
              color="blue"
            />
            <StatCard
              label="Votes All Time"
              value={(totalVotesAllTime ?? 0).toLocaleString()}
              sub="cumulative"
            />
            <StatCard
              label="Questions All Time"
              value={(totalQuestionsAllTime ?? 0).toLocaleString()}
              sub="active"
            />
            <StatCard
              label="Politicians Active"
              value={uniqueActivePoliticians.toLocaleString()}
              sub="with Qs this week"
            />
          </div>
        </div>

        {/* Top Questions */}
        {topQuestions && topQuestions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Top Questions This Week
            </h2>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Question</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Politician</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Votes</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topQuestions.map((q, i) => {
                    const p = q.politicians as { full_name: string; slug: string } | null;
                    const source = q.is_seeded ? "seeded" : q.source === "x" ? "x" : "organic";
                    const sourceBadge =
                      source === "seeded"
                        ? "📋 seeded"
                        : source === "x"
                          ? "🐦 x"
                          : "👤 organic";
                    return (
                      <tr key={q.id} className="bg-card hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <p className="line-clamp-2 text-sm">{q.body}</p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-sm">
                          {p ? (
                            <Link href={`/${p.slug}`} className="hover:underline">
                              {p.full_name}
                            </Link>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                          {q.net_upvotes}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{sourceBadge}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Signups */}
        {recentUsers && recentUsers.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Recent Signups
            </h2>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User ID</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Signed Up</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentUsers.map((u) => (
                    <tr key={u.id} className="bg-card">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{u.id}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fraud Watch */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Fraud Watch: Top Voters Today
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Flag any user with {">"}50 votes today for manual review.
          </p>
          {fraudWatch.length === 0 ? (
            <p className="text-sm text-muted-foreground">No votes cast today yet.</p>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User ID</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Votes Today</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fraudWatch.map(([userId, count]) => (
                    <tr
                      key={userId}
                      className={`bg-card transition-colors ${count > 50 ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-muted/30"}`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{userId}</td>
                      <td className={`px-4 py-2 text-right font-mono font-bold tabular-nums ${count > 50 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {count}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {count > 50 ? "⚠️ Review" : count > 20 ? "👀 Watch" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground border-t pt-4">
          Metrics · WhyTho by Quinnivations LLC ·{" "}
          <Link href={`/admin${secretParam}`} className="underline">Admin home</Link>
        </p>

      </div>
    </div>
  );
}
