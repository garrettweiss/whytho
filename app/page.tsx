import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PoliticianAvatar } from "@/components/politician/politician-avatar";
import {
  HomePoliticianSearch,
  type FeaturedPolitician,
} from "@/components/politician/home-politician-search";
import {
  PoliticianRain,
  type RainItem,
} from "@/components/politician/politician-rain";

export const metadata: Metadata = {
  title: "WhyTho: Hold Your Representatives Accountable",
  description:
    "Ask your politicians questions. See who answers and who stays silent. Silence is its own answer.",
  openGraph: {
    title: "WhyTho: Hold Your Representatives Accountable",
    description:
      "Ask your politicians questions. See who answers and who stays silent. Silence is its own answer.",
    type: "website",
  },
};

// Revalidate every 15 minutes - live question data
export const revalidate = 900;

const TARGET_STATES = [
  { code: "al", name: "Alabama" },
  { code: "ak", name: "Alaska" },
  { code: "az", name: "Arizona" },
  { code: "ar", name: "Arkansas" },
  { code: "ca", name: "California" },
  { code: "co", name: "Colorado" },
  { code: "ct", name: "Connecticut" },
  { code: "de", name: "Delaware" },
  { code: "fl", name: "Florida" },
  { code: "ga", name: "Georgia" },
  { code: "hi", name: "Hawaii" },
  { code: "id", name: "Idaho" },
  { code: "il", name: "Illinois" },
  { code: "in", name: "Indiana" },
  { code: "ia", name: "Iowa" },
  { code: "ks", name: "Kansas" },
  { code: "ky", name: "Kentucky" },
  { code: "la", name: "Louisiana" },
  { code: "me", name: "Maine" },
  { code: "md", name: "Maryland" },
  { code: "ma", name: "Massachusetts" },
  { code: "mi", name: "Michigan" },
  { code: "mn", name: "Minnesota" },
  { code: "ms", name: "Mississippi" },
  { code: "mo", name: "Missouri" },
  { code: "mt", name: "Montana" },
  { code: "ne", name: "Nebraska" },
  { code: "nv", name: "Nevada" },
  { code: "nh", name: "New Hampshire" },
  { code: "nj", name: "New Jersey" },
  { code: "nm", name: "New Mexico" },
  { code: "ny", name: "New York" },
  { code: "nc", name: "North Carolina" },
  { code: "nd", name: "North Dakota" },
  { code: "oh", name: "Ohio" },
  { code: "ok", name: "Oklahoma" },
  { code: "or", name: "Oregon" },
  { code: "pa", name: "Pennsylvania" },
  { code: "ri", name: "Rhode Island" },
  { code: "sc", name: "South Carolina" },
  { code: "sd", name: "South Dakota" },
  { code: "tn", name: "Tennessee" },
  { code: "tx", name: "Texas" },
  { code: "ut", name: "Utah" },
  { code: "vt", name: "Vermont" },
  { code: "va", name: "Virginia" },
  { code: "wa", name: "Washington" },
  { code: "wv", name: "West Virginia" },
  { code: "wi", name: "Wisconsin" },
  { code: "wy", name: "Wyoming" },
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span
        className="h-4 w-1 rounded-full shrink-0"
        style={{ background: "var(--civic)" }}
        aria-hidden
      />
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </h2>
    </div>
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
    { data: featuredSnaps },
    { data: rainQuestionsRaw },
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

    // Leaderboard preview - most recent completed week's snapshots
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

    // Featured politicians for homepage search - most active by qualifying questions
    supabase
      .from("weekly_snapshots")
      .select(
        "politician_id, qualifying_questions, politicians!politician_id(id, slug, full_name, office, state, party, photo_url)"
      )
      .not("politicians", "is", null)
      .gt("qualifying_questions", 0)
      .order("qualifying_questions", { ascending: false })
      .limit(48),

    // Rain data - top questions this week with politician photo
    supabase
      .from("questions")
      .select(
        "id, body, politicians!politician_id(slug, full_name, photo_url)"
      )
      .eq("week_number", weekNumber)
      .eq("status", "active")
      .eq("is_seeded", false)
      .gte("net_upvotes", 1)
      .order("net_upvotes", { ascending: false })
      .limit(20),
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

  // Leaderboard preview - get most recent week, top 3 + bottom 3
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

  const latestWeek = allLeaderboard[0]?.week_number ?? null;
  const weekLeaderboard = latestWeek
    ? allLeaderboard.filter((r) => r.week_number === latestWeek)
    : [];
  const top3 = weekLeaderboard.slice(0, 3);
  const bottom3 = [...weekLeaderboard]
    .sort((a, b) => (a.participation_rate ?? 0) - (b.participation_rate ?? 0))
    .slice(0, 3);

  const previewYear = latestWeek ? Math.floor(latestWeek / 100) : null;
  const previewWeek = latestWeek ? latestWeek % 100 : null;

  // Build featured politicians list (deduplicated, top 12)
  const seenIds = new Set<string>();
  const featuredPoliticians: FeaturedPolitician[] = [];
  for (const row of featuredSnaps ?? []) {
    if (seenIds.has(row.politician_id)) continue;
    seenIds.add(row.politician_id);
    const p = (
      Array.isArray(row.politicians) ? row.politicians[0] : row.politicians
    ) as FeaturedPolitician | null;
    if (p) featuredPoliticians.push(p);
    if (featuredPoliticians.length >= 12) break;
  }

  const rainItems: RainItem[] = (rainQuestionsRaw ?? []).flatMap((q) => {
    const p = Array.isArray(q.politicians) ? q.politicians[0] : q.politicians;
    if (!p || typeof p !== "object" || !("slug" in p)) return [];
    const pol = p as { slug: string; full_name: string; photo_url: string | null };
    return [{ questionId: q.id, body: q.body, slug: pol.slug, fullName: pol.full_name, photoUrl: pol.photo_url }];
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pt-14 pb-20 space-y-16">

        {/* ── Hero ── */}
        <div className="space-y-6">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--civic)" }}
          >
            Civic Accountability Platform
          </p>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
            Your representatives<br />
            have questions<br />
            to answer.
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            Ask questions. Upvote what matters. WhyTho tracks which politicians
            engage with their constituents, and which ones go silent. Their
            response rate is public, forever.
          </p>
          <p className="text-sm text-muted-foreground italic">
            &ldquo;Silence is its own answer.&rdquo;
          </p>
        </div>

        {/* ── Find Your Representative ── */}
        <div>
          <SectionLabel>Find your representative</SectionLabel>
          <HomePoliticianSearch
            featured={featuredPoliticians}
            totalCount={politicianCount ?? 0}
          />
        </div>

        {/* ── Stats ── */}
        {(politicianCount !== null || questionCount !== null) && (
          <div className="flex flex-wrap gap-10">
            {politicianCount !== null && (
              <div>
                <p className="text-3xl font-bold tabular-nums">{politicianCount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-0.5">Politicians tracked</p>
              </div>
            )}
            {questionCount !== null && (
              <div>
                <p className="text-3xl font-bold tabular-nums">{questionCount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-0.5">Questions this week</p>
              </div>
            )}
            {answerCount !== null && answerCount > 0 && (
              <div>
                <p className="text-3xl font-bold tabular-nums">{answerCount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-0.5">Questions answered</p>
              </div>
            )}
          </div>
        )}

        {/* ── CTAs ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/leaderboard"
            className="inline-flex items-center justify-center rounded-xl bg-foreground text-background px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
          >
            See the Leaderboard
          </Link>
          <Link
            href="/races"
            className="inline-flex items-center justify-center rounded-xl border-2 px-6 py-3 font-semibold hover:bg-muted transition-colors"
          >
            Upcoming Elections
          </Link>
        </div>

        {/* ── Top Questions ── */}
        {topQuestions.length > 0 && (
          <div>
            <SectionLabel>Top questions this week</SectionLabel>
            <div className="space-y-2">
              {topQuestions.map((q, i) => (
                <Link
                  key={q.id}
                  href={q.politician ? `/${q.politician.slug}` : "/leaderboard"}
                  className="block rounded-xl border bg-card px-4 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex gap-3 items-start">
                    <span className="text-lg font-bold text-muted-foreground/30 tabular-nums w-6 shrink-0 pt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug line-clamp-2">{q.body}</p>
                      {q.politician && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {q.politician.full_name}
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

        {/* ── Leaderboard Preview ── */}
        {weekLeaderboard.length > 0 && latestWeek && (
          <div>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="h-4 w-1 rounded-full shrink-0"
                  style={{ background: "var(--civic)" }}
                  aria-hidden
                />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Response rate snapshot
                </h2>
              </div>
              {previewYear && previewWeek && (
                <span className="text-xs text-muted-foreground">
                  Week {previewWeek}, {previewYear}
                </span>
              )}
            </div>

            <div className="space-y-4">
              {top3.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide pl-0.5">
                    Most Responsive
                  </p>
                  {top3.map((row, i) => (
                    <Link
                      key={row.politician_id}
                      href={`/${row.slug}`}
                      className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <PoliticianAvatar photoUrl={row.photo_url} fullName={row.full_name} size={32} />
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
                            : "-"}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {row.answered_qualifying}/{row.qualifying_questions}
                        </p>
                      </div>
                      <span className="text-muted-foreground/30 font-bold text-sm shrink-0 w-5 text-right">
                        #{i + 1}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {bottom3.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide pl-0.5">
                    Least Responsive
                  </p>
                  {bottom3.map((row) => (
                    <Link
                      key={row.politician_id}
                      href={`/${row.slug}`}
                      className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <PoliticianAvatar photoUrl={row.photo_url} fullName={row.full_name} size={32} />
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
                          {row.answered_qualifying}/{row.qualifying_questions}
                        </p>
                      </div>
                      <span className="text-muted-foreground/30 text-base shrink-0">💤</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/leaderboard"
              className="inline-block mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View full leaderboard →
            </Link>
          </div>
        )}

        {/* ── How it works ── */}
        <div>
          <SectionLabel>How it works</SectionLabel>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                n: "1",
                title: "Ask a question",
                body: "Find your representative and submit a question. Others upvote the ones that matter most.",
              },
              {
                n: "2",
                title: "Watch the clock",
                body: "Questions with 10+ upvotes become \u201cqualifying\u201d \u2014 ones politicians are publicly expected to answer.",
              },
              {
                n: "3",
                title: "Silence is recorded",
                body: "Every Monday, the week resets. Their response rate is permanently public, whether they answered or not.",
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-background text-sm font-bold shrink-0"
                    style={{ background: "var(--civic)" }}
                  >
                    {n}
                  </span>
                  <p className="font-semibold text-sm">{title}</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-9">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Browse by State ── */}
        <div>
          <SectionLabel>Browse by state</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {TARGET_STATES.map(({ code, name }) => (
              <Link
                key={code}
                href={`/region/${name.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-xl border bg-card px-3 py-2 text-sm font-medium text-center hover:bg-muted hover:border-foreground/20 transition-all"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground border-t pt-8">
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          <Link href="/how-it-works" className="hover:text-foreground transition-colors">How It Works</Link>
          <Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link href="/leaderboard" className="hover:text-foreground transition-colors">Leaderboard</Link>
          <Link href="/races" className="hover:text-foreground transition-colors">Elections</Link>
          <Link href="/verify" className="hover:text-foreground transition-colors">Verify Your Profile</Link>
        </div>

      </div>

      <PoliticianRain items={rainItems} />
    </main>
  );
}
