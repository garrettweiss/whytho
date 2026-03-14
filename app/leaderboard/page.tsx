import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Response Rate Leaderboard — WhyTho",
  description:
    "See which politicians answer their constituents' questions and which ones stay silent. Updated weekly.",
};

// Revalidate every hour — leaderboard is not real-time
export const revalidate = 3600;

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

function rateColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 75) return "text-green-600";
  if (rate >= 40) return "text-yellow-600";
  return "text-red-600";
}

function rateBg(rate: number): string {
  if (rate >= 75) return "bg-green-500";
  if (rate >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function PartyDot({ party }: { party: string | null }) {
  const color =
    party === "Democrat" ? "bg-blue-500" :
    party === "Republican" ? "bg-red-500" :
    party === "Independent" ? "bg-purple-500" :
    "bg-muted-foreground";
  return <span className={`inline-block h-2 w-2 rounded-full ${color} shrink-0`} aria-hidden />;
}

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: weekData } = await supabase.rpc("current_week_number");
  const weekNumber = weekData as number;

  // Pull latest snapshots joined with politician info
  const { data: rows } = await supabase
    .from("weekly_snapshots")
    .select(`
      politician_id,
      participation_rate,
      answered_qualifying,
      qualifying_questions,
      week_number,
      politicians (
        slug,
        full_name,
        office,
        state,
        party,
        photo_url
      )
    `)
    .eq("week_number", weekNumber)
    .not("politicians", "is", null)
    .order("participation_rate", { ascending: false, nullsFirst: false })
    .limit(200);

  // Flatten the join
  const leaderboard: LeaderboardRow[] = (rows ?? [])
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

  const year = Math.floor(weekNumber / 100);
  const week = weekNumber % 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Response Leaderboard</h1>
          <p className="mt-1 text-muted-foreground">
            Week {week}, {year} · Ranked by response rate on qualifying questions (10+ votes)
          </p>
        </div>

        {leaderboard.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center space-y-2">
            <p className="font-medium">No data yet for this week</p>
            <p className="text-sm text-muted-foreground">
              Check back after questions start accumulating.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
            {leaderboard.map((row, i) => (
              <Link
                key={row.politician_id}
                href={`/${row.slug}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group"
              >
                {/* Rank */}
                <span className="w-6 text-sm font-semibold text-muted-foreground tabular-nums shrink-0 text-right">
                  {i + 1}
                </span>

                {/* Photo */}
                <div className="shrink-0">
                  {row.photo_url ? (
                    <div className="relative h-10 w-10 overflow-hidden rounded-full border border-border">
                      <Image
                        src={row.photo_url}
                        alt={row.full_name}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-sm font-bold text-muted-foreground">
                      {row.full_name.slice(0, 1)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <PartyDot party={row.party} />
                    <p className="font-medium truncate group-hover:underline underline-offset-2">
                      {row.full_name}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.office}{row.state && ` · ${row.state}`}
                  </p>
                </div>

                {/* Rate */}
                <div className="shrink-0 text-right space-y-1">
                  <p className={`text-lg font-bold tabular-nums ${rateColor(row.participation_rate)}`}>
                    {row.participation_rate !== null ? `${Math.round(row.participation_rate)}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.answered_qualifying}/{row.qualifying_questions}
                  </p>
                </div>

                {/* Bar */}
                <div className="w-16 shrink-0">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${rateBg(row.participation_rate ?? 0)}`}
                      style={{ width: `${Math.min(row.participation_rate ?? 0, 100)}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Silence is its own answer.
        </p>
      </div>
    </div>
  );
}
