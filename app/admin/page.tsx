/**
 * /admin — Platform admin dashboard
 *
 * Auth: ?secret=ADMIN_SECRET query param
 * Shows: platform stats, verification queue, seeded question queue, quick links
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
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
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
    </div>
  );
}

export default async function AdminDashboard({ searchParams }: Props) {
  const { secret } = await searchParams;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    redirect("/");
  }

  const admin = createAdminClient();

  const { data: weekData } = await admin.rpc("current_week_number");
  const weekNumber = weekData as number;
  const year = Math.floor(weekNumber / 100);
  const week = weekNumber % 100;

  // Parallel stats queries
  const [
    { count: totalPoliticians },
    { count: verifiedPoliticians },
    { count: claimedPoliticians },
    { count: questionsThisWeek },
    { count: totalQuestions },
    { count: totalAnswers },
    { count: totalVotes },
    { count: removedQuestions },
    { count: pendingVerifications },
    { count: totalUsers },
    { data: recentVerifications },
    { data: seededQsNeedingReview },
    { data: recentAnswers },
  ] = await Promise.all([
    admin.from("politicians").select("*", { count: "exact", head: true }).eq("is_active", true),
    admin.from("politicians").select("*", { count: "exact", head: true }).gte("verification_tier", 2),
    admin.from("politicians").select("*", { count: "exact", head: true }).gte("verification_tier", 1),
    admin.from("questions").select("*", { count: "exact", head: true }).eq("week_number", weekNumber).eq("status", "active"),
    admin.from("questions").select("*", { count: "exact", head: true }),
    admin.from("answers").select("*", { count: "exact", head: true }).eq("is_ai_generated", false),
    admin.from("votes").select("*", { count: "exact", head: true }),
    admin.from("questions").select("*", { count: "exact", head: true }).eq("status", "removed"),
    admin.from("politician_verifications").select("*", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("user_profiles").select("*", { count: "exact", head: true }),

    // Pending verifications detail
    admin
      .from("politician_verifications")
      .select("id, method, created_at, politicians!politician_id(full_name, slug, verification_tier)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10),

    // Seeded questions with 0 upvotes (may need better questions)
    admin
      .from("questions")
      .select("id, body, net_upvotes, created_at, politicians!politician_id(full_name, slug)")
      .eq("is_seeded", true)
      .eq("status", "active")
      .eq("week_number", weekNumber)
      .lte("net_upvotes", 0)
      .order("created_at", { ascending: false })
      .limit(8),

    // Recent answers
    admin
      .from("answers")
      .select("id, answer_type, created_at, politicians!politician_id(full_name, slug)")
      .eq("is_ai_generated", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const secretParam = `?secret=${secret}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Week {week}, {year} · WhyTho platform overview
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/races${secretParam}`}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              🗳️ Elections
            </Link>
            <Link
              href={`/admin/moderation${secretParam}`}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Moderation Queue {removedQuestions ? `(${removedQuestions})` : ""}
            </Link>
          </div>
        </div>

        {/* Platform stats */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Platform
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Politicians" value={(totalPoliticians ?? 0).toLocaleString()} sub="active profiles" />
            <StatCard label="Users" value={(totalUsers ?? 0).toLocaleString()} sub="registered accounts" />
            <StatCard label="Questions" value={(questionsThisWeek ?? 0).toLocaleString()} sub={`this week (W${week})`} color="blue" />
            <StatCard label="Total Questions" value={(totalQuestions ?? 0).toLocaleString()} sub="all time" />
            <StatCard label="Votes" value={(totalVotes ?? 0).toLocaleString()} sub="all time" />
            <StatCard label="Answers" value={(totalAnswers ?? 0).toLocaleString()} sub="official responses" color="green" />
            <StatCard label="Removed" value={(removedQuestions ?? 0).toLocaleString()} sub="moderated questions" color="red" />
            <StatCard label="Pending Verif." value={(pendingVerifications ?? 0).toLocaleString()} sub="awaiting review" color={pendingVerifications ? "yellow" : undefined} />
          </div>
        </div>

        {/* Verification breakdown */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Politician Verification
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Unclaimed (T0)" value={((totalPoliticians ?? 0) - (claimedPoliticians ?? 0)).toLocaleString()} sub="never claimed" />
            <StatCard label="Self-Claimed (T1)" value={((claimedPoliticians ?? 0) - (verifiedPoliticians ?? 0)).toLocaleString()} sub="claimed, not verified" color="yellow" />
            <StatCard label="Verified (T2+)" value={(verifiedPoliticians ?? 0).toLocaleString()} sub="identity confirmed" color="green" />
            <StatCard label="Claim Rate" value={totalPoliticians ? `${Math.round(((claimedPoliticians ?? 0) / totalPoliticians) * 100)}%` : "0%"} sub="of all politicians" />
          </div>
        </div>

        {/* Pending verifications */}
        {(pendingVerifications ?? 0) > 0 && recentVerifications && recentVerifications.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Pending Verifications ({pendingVerifications})
            </h2>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Politician</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Method</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Submitted</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentVerifications.map((v) => {
                    const p = v.politicians as { full_name: string; slug: string; verification_tier: "0" | "1" | "2" | "3" } | null;
                    return (
                      <tr key={v.id} className="bg-card hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{p?.full_name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{v.method}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">T{p?.verification_tier ?? 0}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {new Date(v.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {p?.slug && (
                            <Link
                              href={`/${p.slug}`}
                              className="text-xs text-muted-foreground hover:text-foreground underline"
                            >
                              View profile
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Seeded questions with 0 votes — may need replacement */}
        {seededQsNeedingReview && seededQsNeedingReview.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Seeded Questions — No Votes This Week
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              These AI-generated questions have 0 or negative votes. Consider re-seeding better questions.
            </p>
            <div className="space-y-2">
              {seededQsNeedingReview.map((q) => {
                const p = q.politicians as { full_name: string; slug: string } | null;
                return (
                  <div
                    key={q.id}
                    className="flex gap-3 items-start rounded-lg border bg-card px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{q.body}</p>
                      {p && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          → {p.full_name}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-mono text-muted-foreground">{q.net_upvotes}</p>
                      {p?.slug && (
                        <Link
                          href={`/${p.slug}`}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          view
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent answers */}
        {recentAnswers && recentAnswers.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Recent Official Answers
            </h2>
            <div className="space-y-2">
              {recentAnswers.map((a) => {
                const p = a.politicians as { full_name: string; slug: string } | null;
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p?.full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.answer_type === "direct" ? "🏛️ Direct answer" : "👥 Team statement"} ·{" "}
                        {new Date(a.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {p?.slug && (
                      <Link
                        href={`/${p.slug}`}
                        className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                      >
                        view
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/moderation${secretParam}`}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              📋 Moderation Queue
            </Link>
            <a
              href={`/api/admin/seed-questions`}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              🌱 Seed Questions (API)
            </a>
            <Link
              href="/leaderboard"
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              📊 Leaderboard
            </Link>
            <Link
              href="/federal"
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              🏛️ Browse Politicians
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-4">
          Admin panel · WhyTho by Quinnivations LLC
        </p>

      </div>
    </div>
  );
}
