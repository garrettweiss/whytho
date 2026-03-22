import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AnswerComposer } from "@/components/answers/answer-composer";
import { TeamManager } from "@/components/dashboard/team-manager";
import { ProfileEditor } from "@/components/dashboard/profile-editor";
import { DisputeClientButton } from "@/components/dashboard/dispute-button";
import { DisconnectButton } from "@/components/dashboard/disconnect-button";
import { AnswerEditButton } from "@/components/dashboard/answer-edit-button";
import { DraftApproveButton } from "@/components/dashboard/draft-approve-button";

export const metadata: Metadata = {
  title: "Politician Dashboard | WhyTho",
  description: "Manage your WhyTho profile and respond to constituent questions.",
};

type AnswerRow = {
  id: string;
  answer_type: string;
  body: string;
  is_ai_generated: boolean;
  is_draft: boolean;
  created_at: string;
};

type QuestionRow = {
  id: string;
  body: string;
  net_upvotes: number;
  week_number: number;
  created_at: string;
  answers: AnswerRow[];
};

type DraftRow = {
  id: string;
  body: string;
  created_at: string;
  question_id: string;
  question_body: string;
};

const QUALIFYING_THRESHOLD = 10;
const NEW_QUESTION_HOURS = 48; // Questions added in last 48h get a "New" badge

/** Friendly verification tier badge */
function TierBadge({ tier }: { tier: string }) {
  const badges: Record<string, { label: string; className: string }> = {
    "0": { label: "Unclaimed", className: "bg-muted text-muted-foreground" },
    "1": { label: "Self-Claimed", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    "2": { label: "Verified ✓", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    "3": { label: "Fully Verified ✓✓", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  };
  const badge = badges[tier] ?? badges["0"]!;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

/** Single question card with answer display, dispute, and composer */
function QuestionCard({
  question,
  isAdmin,
  hasOfficialAnswer,
  politicianSlug,
  isNew,
}: {
  question: QuestionRow;
  isAdmin: boolean;
  hasOfficialAnswer: boolean;
  politicianSlug: string;
  isNew: boolean;
}) {
  const officialAnswer = question.answers.find((a) =>
    ["direct", "team_statement"].includes(a.answer_type) && !a.is_ai_generated && !a.is_draft
  );
  const aiAnswer = question.answers.find(
    (a) => a.answer_type === "ai_analysis" && a.is_ai_generated
  );

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Question header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isNew && (
                <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  New
                </span>
              )}
              {question.net_upvotes >= QUALIFYING_THRESHOLD && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Qualifying
                </span>
              )}
            </div>
            <p className="text-sm font-medium leading-snug">{question.body}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              ▲ {question.net_upvotes}
            </span>
            <Link
              href={`/${politicianSlug}#question-${question.id}`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap"
              target="_blank"
            >
              View on profile →
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Official answer (already answered) */}
        {officialAnswer && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {officialAnswer.answer_type === "direct"
                ? "🏛️ Official Response"
                : "👥 Team Statement"}
            </p>
            <p className="text-sm leading-relaxed">{officialAnswer.body}</p>
            <AnswerEditButton
              answerId={officialAnswer.id}
              initialBody={officialAnswer.body}
              createdAt={officialAnswer.created_at}
            />
          </div>
        )}

        {/* AI analysis — with dispute option */}
        {aiAnswer && (
          <div className="rounded-lg border border-muted bg-muted/20 px-3 py-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              🤖 AI Analysis of Public Record
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {aiAnswer.body}
            </p>
            <DisputeClientButton answerId={aiAnswer.id} />
          </div>
        )}

        {/* Compose answer (unanswered questions) */}
        {!hasOfficialAnswer && (
          <AnswerComposer
            questionId={question.id}
            questionBody={question.body}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    redirect("/sign-in?redirect=/dashboard");
  }

  // Respect the view mode toggle — citizens (or politicians in citizen mode) cannot access dashboard
  const cookieStore = await cookies();
  const viewMode = cookieStore.get("whytho-view-mode")?.value;
  if (viewMode === "citizen") {
    redirect("/");
  }

  const { data: weekData } = await supabase.rpc("current_week_number");
  const currentWeekNumber = weekData as number;

  const { data: memberships } = await supabase
    .from("politician_team")
    .select(`
      role,
      politicians (
        id,
        slug,
        full_name,
        office,
        state,
        party,
        photo_url,
        website_url,
        bio,
        verification_tier
      )
    `)
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Politician Dashboard</h1>
            <p className="text-muted-foreground mb-8">
              You haven&apos;t claimed a politician profile yet.
            </p>
            <Link
              href="/verify"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Claim Your Profile →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cutoff48h = new Date(Date.now() - NEW_QUESTION_HOURS * 60 * 60 * 1000).toISOString();

  type PoliticianWithData = {
    politician: {
      id: string;
      slug: string;
      full_name: string;
      office: string | null;
      state: string | null;
      party: string | null;
      photo_url: string | null;
      website_url: string | null;
      bio: string | null;
      verification_tier: string;
    };
    role: string;
    isOnlyAdmin: boolean;
    questions: QuestionRow[];
    drafts: DraftRow[];
    participationRate: number | null;
    stats: { totalQuestions: number; totalAnswers: number; thisWeekQuestions: number };
  };

  const politiciansData: PoliticianWithData[] = [];

  for (const membership of memberships) {
    const politician = Array.isArray(membership.politicians)
      ? membership.politicians[0]
      : membership.politicians;
    if (!politician) continue;

    const [
      { data: questions },
      { data: rateData },
      { count: totalQuestions },
      { count: totalAnswers },
      { count: thisWeekQuestions },
      { data: rawDrafts },
      { count: adminCount },
    ] = await Promise.all([
      supabase
        .from("questions")
        .select(`id, body, net_upvotes, week_number, created_at, answers ( id, answer_type, body, is_ai_generated, is_draft, created_at )`)
        .eq("politician_id", politician.id)
        .eq("week_number", currentWeekNumber)
        .eq("status", "active")
        .gte("net_upvotes", QUALIFYING_THRESHOLD)
        .order("net_upvotes", { ascending: false })
        .limit(25),
      supabase.rpc("participation_rate_period", {
        p_politician_id: politician.id,
        p_period: "week",
      }),
      supabase.from("questions").select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id).eq("status", "active"),
      supabase.from("answers").select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id).eq("is_ai_generated", false).eq("is_draft", false),
      supabase.from("questions").select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id).eq("week_number", currentWeekNumber).eq("status", "active"),
      // Fetch pending drafts (only relevant for admin/editor roles)
      ["admin", "editor"].includes(membership.role)
        ? supabase
            .from("answers")
            .select(`id, body, created_at, question_id, questions ( body )`)
            .eq("politician_id", politician.id)
            .eq("is_draft", true)
            .eq("is_ai_generated", false)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      // Count admins to determine if caller is the only one
      supabase
        .from("politician_team")
        .select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id)
        .eq("role", "admin"),
    ]);

    // Normalize rawDrafts (questions is a joined object)
    const drafts: DraftRow[] = (rawDrafts ?? []).map((d) => {
      const q = Array.isArray(d.questions) ? d.questions[0] : d.questions;
      return {
        id: d.id,
        body: d.body,
        created_at: d.created_at,
        question_id: d.question_id,
        question_body: (q as { body: string } | null)?.body ?? "",
      };
    });

    politiciansData.push({
      politician,
      role: membership.role,
      isOnlyAdmin: membership.role === "admin" && (adminCount ?? 0) <= 1,
      questions: (questions ?? []) as QuestionRow[],
      drafts,
      participationRate: rateData as number | null,
      stats: {
        totalQuestions: totalQuestions ?? 0,
        totalAnswers: totalAnswers ?? 0,
        thisWeekQuestions: thisWeekQuestions ?? 0,
      },
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Politician Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Qualifying questions have 10+ net upvotes and count toward your public response rate.
            </p>
          </div>
          <Link
            href="/verify"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
          >
            Manage verification
          </Link>
        </div>

        {politiciansData.map(({ politician, role, isOnlyAdmin, questions, drafts, participationRate, stats }) => {
          const unansweredCount = questions.filter(
            (q) => !q.answers.some(
              (a) => ["direct", "team_statement"].includes(a.answer_type) && !a.is_ai_generated && !a.is_draft
            )
          ).length;

          const rateDisplay =
            participationRate !== null ? `${Math.round(participationRate)}%` : "—";
          const rateColor =
            participationRate === null
              ? "text-muted-foreground"
              : participationRate >= 75
              ? "text-green-600 dark:text-green-400"
              : participationRate >= 40
              ? "text-amber-600 dark:text-amber-400"
              : "text-red-600 dark:text-red-400";

          return (
            <div key={politician.id} className="space-y-4">
              {/* Politician header */}
              <div className="flex items-center gap-4">
                <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full border bg-muted text-sm font-bold text-muted-foreground overflow-hidden">
                  {politician.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={politician.photo_url} alt={politician.full_name} className="h-full w-full object-cover" />
                  ) : (
                    politician.full_name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/${politician.slug}`}
                      className="font-semibold hover:underline underline-offset-2"
                    >
                      {politician.full_name}
                    </Link>
                    <TierBadge tier={politician.verification_tier} />
                    <span className="text-xs text-muted-foreground capitalize">{role}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {[politician.office, politician.state].filter(Boolean).join(" · ")}
                  </p>
                </div>

                {/* Analytics strip */}
                <div className="flex gap-4 shrink-0 text-center">
                  <div>
                    <p className={`text-lg font-bold tabular-nums ${rateColor}`}>{rateDisplay}</p>
                    <p className="text-xs text-muted-foreground">response rate</p>
                  </div>
                  <div className="border-l pl-4">
                    <p className="text-lg font-bold tabular-nums">{stats.thisWeekQuestions}</p>
                    <p className="text-xs text-muted-foreground">this week</p>
                  </div>
                  <div className="border-l pl-4">
                    <p className="text-lg font-bold tabular-nums">{stats.totalAnswers}</p>
                    <p className="text-xs text-muted-foreground">answered</p>
                  </div>
                </div>

                {/* Verification prompt for tier < 2 */}
                {parseInt(politician.verification_tier) < 2 && (
                  <Link
                    href="/verify"
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                  >
                    ⚠️ Verify identity
                  </Link>
                )}
              </div>

              {/* Draft queue (admin/editor only) */}
              {["admin", "editor"].includes(role) && drafts.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {drafts.length} draft response{drafts.length !== 1 ? "s" : ""} awaiting approval
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Submitted by a responder. Review and approve to publish.
                    </p>
                  </div>
                  <div className="divide-y divide-amber-200 dark:divide-amber-800">
                    {drafts.map((draft) => (
                      <div key={draft.id} className="px-4 py-4 space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Question</p>
                        <p className="text-sm text-muted-foreground">{draft.question_body}</p>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mt-2">Draft Response</p>
                        <p className="text-sm">{draft.body}</p>
                        <div className="pt-1">
                          <DraftApproveButton answerId={draft.id} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Question inbox */}
              {questions.length === 0 ? (
                <div className="rounded-xl border bg-card p-8 text-center">
                  <p className="text-muted-foreground text-sm">No qualifying questions this week yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Questions reach qualifying status when they get 10+ net upvotes.
                  </p>
                  <Link
                    href={`/${politician.slug}`}
                    className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    View public profile →
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {questions.length} qualifying question{questions.length !== 1 ? "s" : ""} this week
                    </span>
                    {unansweredCount > 0 ? (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {unansweredCount} awaiting response
                      </span>
                    ) : (
                      <span className="font-medium text-green-600 dark:text-green-400">
                        ✓ All answered
                      </span>
                    )}
                  </div>

                  {questions.map((question) => {
                    const hasOfficialAnswer = question.answers.some(
                      (a) => ["direct", "team_statement"].includes(a.answer_type) && !a.is_ai_generated && !a.is_draft
                    );
                    const isNew = question.created_at > cutoff48h;
                    return (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        isAdmin={role === "admin"}
                        hasOfficialAnswer={hasOfficialAnswer}
                        politicianSlug={politician.slug}
                        isNew={isNew}
                      />
                    );
                  })}
                </div>
              )}

              {/* Profile editing (admin only) */}
              {role === "admin" && (
                <ProfileEditor
                  politicianId={politician.id}
                  currentWebsiteUrl={politician.website_url}
                  currentBio={politician.bio}
                />
              )}

              {/* Team Management */}
              <TeamManager politicianId={politician.id} callerRole={role} />

              {/* Disconnect from this profile */}
              {role === "admin" && (
                <div className="pt-2 border-t">
                  <DisconnectButton
                    politicianId={politician.id}
                    politicianName={politician.full_name}
                    isOnlyAdmin={isOnlyAdmin}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
