import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { PoliticianSearch } from "@/components/politician/politician-search";

export const metadata: Metadata = {
  title: "WhyTho — Hold Your Representatives Accountable",
  description:
    "Ask your politicians questions. See who answers and who stays silent. Silence is its own answer.",
  openGraph: {
    title: "WhyTho — Hold Your Representatives Accountable",
    description:
      "Ask your politicians questions. See who answers and who stays silent. Silence is its own answer.",
    type: "website",
  },
};

// Revalidate every 15 minutes — live question data
export const revalidate = 900;

const TARGET_STATES = [
  { code: "ca", name: "California" },
  { code: "tx", name: "Texas" },
  { code: "fl", name: "Florida" },
  { code: "ny", name: "New York" },
  { code: "pa", name: "Pennsylvania" },
  { code: "oh", name: "Ohio" },
  { code: "ga", name: "Georgia" },
  { code: "nc", name: "North Carolina" },
  { code: "mi", name: "Michigan" },
  { code: "az", name: "Arizona" },
];

function rateColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 75) return "text-green-600 dark:text-green-400";
  if (rate >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function PartyDot({ party }: { party: string | null }) {
  const color =
    party === "Democrat"
      ? "bg-blue-500"
      : party === "Republican"
        ? "bg-red-500"
        : party === "Independent"
          ? "bg-purple-500"
          : "bg-muted-foreground";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color} shrink-0`}
      aria-hidden
    />
  );
}

export default async function HomePage() {
  const supabase = await createClient();

  const { data: weekData } = await supabase.rpc("current_week_number");
  const weekNumber = weekData as number;

  // Parallel data fetches
  const [
    { count: politicianCount },
    { count: questionCount },
    { count: answerCount },
    { data: topQuestionsRaw },
    { data: leaderboardRaw },
  ] = await Promise.all([
    supabase
      .from("politicians")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),

    supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("week_number", weekNumber)
      .eq("status", "active"),

    supabase
      .from("answers")
      .select("*", { count: "exact", head: true }),

    // Top 5 user-submitted questions this week
    supabase
      .from("questions")
      .select(
        "id, body, net_upvotes, is_seeded, politicians!politician_id(slug, full_name, office, state, party)"
      )
      .eq("week_number", weekNumber)
      .eq("status", "active")
      .eq("is_seeded", false)
      .gte("net_upvotes", 1)
      .order("net_upvotes", { ascending: false })
      .limit(5),

    // Leaderboard preview — most recent completed week's snapshots
    supabase
      .from("weekly_snapshots")
      .select(
        "politician_id, participation_rate, answered_qualifying, qualifying_questions, week_number, politicians!politician_id(slug, full_name, office, state, party, photo_url)"
      )
      .not("politicians", "is", null)
      .gt("qualifying_questions", 0)
      .order("week_number", { ascending: false })
      .order("participation_rate", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  // Top questions with politician context
  interface TopQuestion {
    id: string;
    body: string;
    net_upvotes: number;
    politician: { slug: string; full_name: string; office: string | null; state: string | null; party: string | null } | null;
  }
  const topQuestions: TopQuestion[] = (topQuestionsRaw ?? []).map((q) => ({
    id: q.id,
    body: q.body,
    net_upvotes: q.net_upvotes,
    politician: Array.isArray(q.politicians)
      ? (q.politicians[0] ?? null)
      : (q.politicians as TopQuestion["politician"]) ?? null,
  }));

  // Leaderboard preview — get most recent week, top 3 + bottom 3
  interface LeaderboardRow {
    politician_id: string;
    slug: string;
    full_name: string;
    office: string | null;
    state: string | null;
    party: string | null;
    photo_url: string | null;
    participation_rate: number | null;
    answered_qualifying: number;
    qualifying_questions: number;
    week_number: number;
  }

  const allLeaderboard: LeaderboardRow[] = (leaderboardRaw ?? [])
    .filter((r) => r.politicians !== null)
    .map((r) => {
      const p = r.politicians as {
        slug: string;
        full_name: string;
        office: string | null;
        state: string | null;
        party: string | null;
        photo_url: string | null;
      };
      return {
        politician_id: r.politician_id,
        slug: p.slug,
        full_name: p.full_name,
        office: p.office,
        state: p.state,
        party: p.party,
        photo_url: p.photo_url,
        participation_rate: r.participation_rate,
        answered_qualifying: r.answered_qualifying,
        qualifying_questions: r.qualifying_questions,
        week_number: r.week_number,
      };
    });

  // Get most recent week's data
  const latestWeek = allLeaderboard[0]?.week_number ?? null;
  const weekLeaderboard = latestWeek
    ? allLeaderboard.filter((r) => r.week_number === latestWeek)
    : [];
  const top3 = weekLeaderboard.slice(0, 3);
  const bottom3 = [...weekLeaderboard].sort(
    (a, b) => (a.participation_rate ?? 0) - (b.participation_rate ?? 0)
  ).slice(0, 3);

  const previewYear = latestWeek ? Math.floor(latestWeek / 100) : null;
  const previewWeek = latestWeek ? latestWeek % 100 : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-14">

        {/* Hero */}
        <div className="space-y-4 text-center">
          <h1 className="text-5xl font-bold tracking-tight">WhyTho</h1>
          <p className="text-xl text-muted-foreground max-w-lg mx-auto">
            Hold your representatives accountable. Ask questions. Track who answers.
          </p>
          <p className="text-muted-foreground font-medium italic">
            Silence is its own answer.
          </p>
        </div>

        {/* Search */}
        <PoliticianSearch />

        {/* Stats */}
        <div className="flex flex-wrap justify-center gap-8 text-center">
          {politicianCount !== null && (
            <div>
              <p className="text-3xl font-bold">{politicianCount.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Politicians tracked</p>
            </div>
          )}
          {questionCount !== null && (
            <div>
              <p className="text-3xl font-bold">{questionCount.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Questions this week</p>
            </div>
          )}
          {answerCount !== null && answerCount > 0 && (
            <div>
              <p className="text-3xl font-bold">{answerCount.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Questions answered</p>
            </div>
          )}
        </div>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/leaderboard"
            className="inline-flex items-center justify-center rounded-lg bg-foreground text-background px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
          >
            See the Leaderboard
          </Link>
          <Link
            href="/federal"
            className="inline-flex items-center justify-center rounded-lg border px-6 py-3 font-semibold hover:bg-muted transition-colors"
          >
            Browse Federal Reps
          </Link>
        </div>

        {/* Top questions this week */}
        {topQuestions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">🔥 Top Questions This Week</h2>
              <span className="text-xs text-muted-foreground">by upvotes</span>
            </div>
            <div className="space-y-2">
              {topQuestions.map((q, i) => (
                <Link
                  key={q.id}
                  href={q.politician ? `/${q.politician.slug}` : "/leaderboard"}
                  className="block rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex gap-3 items-start">
                    <span className="text-xl font-bold text-muted-foreground/40 tabular-nums w-6 shrink-0 pt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2">{q.body}</p>
                      {q.politician && (
                        <p className="text-xs text-muted-foreground mt-1">
                          → {q.politician.full_name}
                          {q.politician.office && ` · ${q.politician.office}`}
                          {q.politician.state && `, ${q.politician.state}`}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">▲ {q.net_upvotes}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard preview */}
        {weekLeaderboard.length > 0 && latestWeek && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">📊 Response Rate Snapshot</h2>
              {previewYear && previewWeek && (
                <span className="text-xs text-muted-foreground">
                  Week {previewWeek}, {previewYear}
                </span>
              )}
            </div>

            {/* Top responders */}
            {top3.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                  Most Responsive
                </p>
                {top3.map((row, i) => (
                  <Link
                    key={row.politician_id}
                    href={`/${row.slug}`}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    {row.photo_url ? (
                      <Image
                        src={row.photo_url}
                        alt={row.full_name}
                        width={32}
                        height={32}
                        className="rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-muted-foreground">
                          {row.full_name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <PartyDot party={row.party} />
                        <p className="text-sm font-medium truncate">{row.full_name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.office}{row.state ? `, ${row.state}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold ${rateColor(row.participation_rate)}`}>
                        {row.participation_rate !== null
                          ? `${Math.round(row.participation_rate)}%`
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {row.answered_qualifying}/{row.qualifying_questions} answered
                      </p>
                    </div>
                    <span className="text-muted-foreground/40 font-bold text-sm shrink-0">
                      #{i + 1}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {/* Least responsive */}
            {bottom3.length > 0 && (
              <div className="space-y-1.5 mt-3">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                  Least Responsive
                </p>
                {bottom3.map((row) => (
                  <Link
                    key={row.politician_id}
                    href={`/${row.slug}`}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    {row.photo_url ? (
                      <Image
                        src={row.photo_url}
                        alt={row.full_name}
                        width={32}
                        height={32}
                        className="rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-muted-foreground">
                          {row.full_name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <PartyDot party={row.party} />
                        <p className="text-sm font-medium truncate">{row.full_name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.office}{row.state ? `, ${row.state}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold ${rateColor(row.participation_rate)}`}>
                        {row.participation_rate !== null
                          ? `${Math.round(row.participation_rate)}%`
                          : "0%"}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {row.answered_qualifying}/{row.qualifying_questions} answered
                      </p>
                    </div>
                    <span className="text-muted-foreground/40 font-bold text-sm shrink-0">
                      💤
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <Link
              href="/leaderboard"
              className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              View full leaderboard →
            </Link>
          </div>
        )}

        {/* How it works */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <h2 className="text-lg font-semibold">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold shrink-0">
                  1
                </span>
                <p className="font-medium text-sm">Ask a question</p>
              </div>
              <p className="text-sm text-muted-foreground pl-9">
                Find your representative and submit a question. Others upvote the ones that matter most.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold shrink-0">
                  2
                </span>
                <p className="font-medium text-sm">Watch the clock</p>
              </div>
              <p className="text-sm text-muted-foreground pl-9">
                Questions with 10+ upvotes become &ldquo;qualifying&rdquo; — ones politicians are publicly expected to answer.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold shrink-0">
                  3
                </span>
                <p className="font-medium text-sm">Silence is recorded</p>
              </div>
              <p className="text-sm text-muted-foreground pl-9">
                Every Monday, the week resets. Their response rate is permanently public — whether they answered or not.
              </p>
            </div>
          </div>
        </div>

        {/* Browse by state */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Browse by State</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {TARGET_STATES.map(({ code, name }) => (
              <Link
                key={code}
                href={`/state/${code}`}
                className="rounded-lg border bg-card px-3 py-2 text-sm font-medium text-center hover:bg-muted transition-colors"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>

        {/* Footer links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground border-t pt-8">
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          <Link href="/how-it-works" className="hover:text-foreground transition-colors">How It Works</Link>
          <Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link href="/leaderboard" className="hover:text-foreground transition-colors">Leaderboard</Link>
          <Link href="/federal" className="hover:text-foreground transition-colors">Federal Reps</Link>
          <Link href="/verify" className="hover:text-foreground transition-colors">Verify Your Profile</Link>
        </div>

      </div>
    </main>
  );
}
