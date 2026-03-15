import type { Metadata } from "next";
import Link from "next/link";
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

export default async function HomePage() {
  const supabase = await createClient();

  // Quick stats
  const { count: politicianCount } = await supabase
    .from("politicians")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { data: weekData } = await supabase.rpc("current_week_number");
  const weekNumber = weekData as number;

  const { count: questionCount } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("week_number", weekNumber)
    .eq("status", "active");

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-12">
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
        {politicianCount !== null && (
          <div className="flex justify-center gap-8 text-center">
            <div>
              <p className="text-3xl font-bold">{politicianCount.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Politicians tracked</p>
            </div>
            {questionCount !== null && (
              <div>
                <p className="text-3xl font-bold">{questionCount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Questions this week</p>
              </div>
            )}
          </div>
        )}

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

        {/* How it works */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">How it works</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="text-foreground font-bold shrink-0">1.</span>
              <p>Find your representative. Every elected official has a profile.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-foreground font-bold shrink-0">2.</span>
              <p>
                Submit or upvote questions. Questions with 10+ net votes become
                &quot;qualifying&quot; — ones politicians are expected to answer.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-foreground font-bold shrink-0">3.</span>
              <p>
                Every week resets. Questions are archived and fresh ones begin. Their
                response rate is permanent.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-foreground font-bold shrink-0">4.</span>
              <p>
                Non-response is always visible. Silence is its own answer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
