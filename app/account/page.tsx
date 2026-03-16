import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AccountProfileForm } from "@/components/account/account-profile-form";

export const metadata: Metadata = {
  title: "My Account — WhyTho",
};

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

type Tab = "questions" | "votes" | "profile";

function formatWeekLabel(weekNumber: number): string {
  const year = Math.floor(weekNumber / 100);
  const week = weekNumber % 100;
  return `Week ${week}, ${year}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AccountPage({ searchParams }: Props) {
  const { tab: tabParam } = await searchParams;
  const activeTab: Tab =
    tabParam === "votes" ? "votes" :
    tabParam === "profile" ? "profile" :
    "questions";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Must be logged in with a real account (not anonymous)
  if (!user || user.is_anonymous) {
    redirect("/sign-in");
  }

  // ── My Questions ──────────────────────────────────────────────────────────
  const { data: myQuestions } = await supabase
    .from("questions")
    .select(
      `id, body, net_upvotes, week_number, status, created_at,
       politicians ( full_name, slug )`
    )
    .eq("submitted_by", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // ── My Votes ──────────────────────────────────────────────────────────────
  const { data: myVotes } = await supabase
    .from("votes")
    .select(
      `id, value, week_number, created_at,
       questions ( id, body, net_upvotes, week_number,
         politicians ( full_name, slug )
       )`
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // ── Profile ───────────────────────────────────────────────────────────────
  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("city, county, state_code, political_affiliation")
    .eq("id", user.id)
    .maybeSingle();

  const questions = myQuestions ?? [];
  const votes = myVotes ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Account</h1>
        <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit" role="tablist">
        <Link
          href="/account?tab=questions"
          role="tab"
          aria-selected={activeTab === "questions"}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "questions"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Questions ({questions.length})
        </Link>
        <Link
          href="/account?tab=votes"
          role="tab"
          aria-selected={activeTab === "votes"}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "votes"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Votes ({votes.length})
        </Link>
        <Link
          href="/account?tab=profile"
          role="tab"
          aria-selected={activeTab === "profile"}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "profile"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Profile
        </Link>
      </div>

      {/* Question History */}
      {activeTab === "questions" && (
        <section className="space-y-3">
          {questions.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center space-y-2">
              <p className="font-medium">No questions yet</p>
              <p className="text-sm text-muted-foreground">
                Questions you submit to politicians will appear here.
              </p>
            </div>
          ) : (
            questions.map((q) => {
              const pol = Array.isArray(q.politicians) ? q.politicians[0] : q.politicians;
              const slug = pol?.slug ?? null;
              const polName = pol?.full_name ?? "Unknown Politician";
              return (
                <div
                  key={q.id}
                  className="rounded-xl border bg-card p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-snug">{q.body}</p>
                    <span
                      className={`shrink-0 text-xs font-medium tabular-nums ${
                        q.net_upvotes > 0
                          ? "text-green-600"
                          : q.net_upvotes < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {q.net_upvotes > 0 ? "+" : ""}
                      {q.net_upvotes}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {slug ? (
                      <Link
                        href={`/${slug}`}
                        className="hover:text-foreground underline-offset-2 hover:underline"
                      >
                        {polName}
                      </Link>
                    ) : (
                      <span>{polName}</span>
                    )}
                    <span>·</span>
                    <span>{formatWeekLabel(q.week_number)}</span>
                    <span>·</span>
                    <span>{formatDate(q.created_at)}</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* Profile */}
      {activeTab === "profile" && (
        <section>
          <AccountProfileForm
            initialCity={profileData?.city ?? null}
            initialCounty={profileData?.county ?? null}
            initialStateCode={profileData?.state_code ?? null}
            initialAffiliation={profileData?.political_affiliation ?? null}
          />
        </section>
      )}

      {/* Vote History */}
      {activeTab === "votes" && (
        <section className="space-y-3">
          {votes.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center space-y-2">
              <p className="font-medium">No votes yet</p>
              <p className="text-sm text-muted-foreground">
                Questions you upvote or downvote will appear here.
              </p>
            </div>
          ) : (
            votes.map((v) => {
              const q = Array.isArray(v.questions) ? v.questions[0] : v.questions;
              if (!q) return null;
              const pol = Array.isArray(q.politicians) ? q.politicians[0] : q.politicians;
              const slug = pol?.slug ?? null;
              const polName = pol?.full_name ?? "Unknown Politician";
              const isUp = v.value > 0;
              return (
                <div
                  key={v.id}
                  className="rounded-xl border bg-card p-4 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`shrink-0 mt-0.5 text-sm font-bold ${
                        isUp ? "text-green-600" : "text-red-600"
                      }`}
                      aria-label={isUp ? "Upvoted" : "Downvoted"}
                    >
                      {isUp ? "▲" : "▼"}
                    </span>
                    <p className="text-sm font-medium leading-snug">{q.body}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6">
                    {slug ? (
                      <Link
                        href={`/${slug}`}
                        className="hover:text-foreground underline-offset-2 hover:underline"
                      >
                        {polName}
                      </Link>
                    ) : (
                      <span>{polName}</span>
                    )}
                    <span>·</span>
                    <span>{formatWeekLabel(q.week_number)}</span>
                    <span>·</span>
                    <span>{formatDate(v.created_at)}</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </main>
  );
}
