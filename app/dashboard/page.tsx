import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AnswerComposer } from "@/components/answers/answer-composer";

export const metadata: Metadata = {
  title: "Politician Dashboard — WhyTho",
  description: "Manage your WhyTho profile and respond to constituent questions.",
};

type AnswerRow = {
  id: string;
  answer_type: string;
  body: string;
  is_ai_generated: boolean;
};

type QuestionRow = {
  id: string;
  body: string;
  net_upvotes: number;
  week_number: number;
  answers: AnswerRow[];
};

const QUALIFYING_THRESHOLD = 10;

/** Friendly verification tier badge */
function TierBadge({ tier }: { tier: string }) {
  const badges: Record<string, { label: string; className: string }> = {
    "0": {
      label: "Unclaimed",
      className: "bg-muted text-muted-foreground",
    },
    "1": {
      label: "Self-Claimed",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    "2": {
      label: "Verified ✓",
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    },
    "3": {
      label: "Fully Verified ✓✓",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
  };
  const badge = badges[tier] ?? badges["0"]!;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

/** Single question card with optional answer display and composer */
function QuestionCard({
  question,
  isAdmin,
  hasOfficialAnswer,
}: {
  question: QuestionRow;
  isAdmin: boolean;
  hasOfficialAnswer: boolean;
}) {
  const officialAnswer = question.answers.find((a) =>
    ["direct", "team_statement"].includes(a.answer_type) && !a.is_ai_generated
  );
  const aiAnswer = question.answers.find(
    (a) => a.answer_type === "ai_analysis" && a.is_ai_generated
  );

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Question header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-snug">{question.body}</p>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              ▲ {question.net_upvotes}
            </span>
            {question.net_upvotes >= QUALIFYING_THRESHOLD && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Qualifying
              </span>
            )}
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
          </div>
        )}

        {/* AI analysis note */}
        {aiAnswer && !officialAnswer && (
          <p className="text-xs text-muted-foreground italic">
            🤖 AI analysis available — add an official response above it.
          </p>
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

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    redirect("/sign-in?redirect=/dashboard");
  }

  // Fetch current week number
  const { data: weekData } = await supabase.rpc("current_week_number");
  const currentWeekNumber = weekData as number;

  // Fetch politician_team memberships for this user
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
        verification_tier
      )
    `)
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    // Not on any team — prompt to claim a profile
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

  // Fetch qualifying questions + answers for each politician
  type PoliticianWithQuestions = {
    politician: {
      id: string;
      slug: string;
      full_name: string;
      office: string | null;
      state: string | null;
      party: string | null;
      photo_url: string | null;
      verification_tier: string;
    };
    role: string;
    questions: QuestionRow[];
  };

  const politiciansData: PoliticianWithQuestions[] = [];

  for (const membership of memberships) {
    const politician = Array.isArray(membership.politicians)
      ? membership.politicians[0]
      : membership.politicians;

    if (!politician) continue;

    const { data: questions } = await supabase
      .from("questions")
      .select(`
        id,
        body,
        net_upvotes,
        week_number,
        answers (
          id,
          answer_type,
          body,
          is_ai_generated
        )
      `)
      .eq("politician_id", politician.id)
      .eq("week_number", currentWeekNumber)
      .eq("status", "active")
      .gte("net_upvotes", QUALIFYING_THRESHOLD)
      .order("net_upvotes", { ascending: false })
      .limit(25);

    politiciansData.push({
      politician,
      role: membership.role,
      questions: (questions ?? []) as QuestionRow[],
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Politician Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Qualifying questions have 10+ net upvotes and are visible to the public.
            </p>
          </div>
          <Link
            href="/verify"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
          >
            Manage verification
          </Link>
        </div>

        {/* One section per politician */}
        {politiciansData.map(({ politician, role, questions }) => {
          const unansweredCount = questions.filter(
            (q) =>
              !q.answers.some(
                (a) =>
                  ["direct", "team_statement"].includes(a.answer_type) &&
                  !a.is_ai_generated
              )
          ).length;

          return (
            <div key={politician.id} className="space-y-4">
              {/* Politician header */}
              <div className="flex items-center gap-4">
                <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full border bg-muted text-sm font-bold text-muted-foreground overflow-hidden">
                  {politician.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={politician.photo_url}
                      alt={politician.full_name}
                      className="h-full w-full object-cover"
                    />
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
                    <span className="text-xs text-muted-foreground capitalize">
                      {role}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {[politician.office, politician.state].filter(Boolean).join(" · ")}
                  </p>
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

              {/* Question inbox */}
              {questions.length === 0 ? (
                <div className="rounded-xl border bg-card p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    No qualifying questions this week yet.
                  </p>
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
                  {/* Inbox summary */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {questions.length} qualifying question
                      {questions.length !== 1 ? "s" : ""} this week
                    </span>
                    {unansweredCount > 0 && (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {unansweredCount} awaiting response
                      </span>
                    )}
                    {unansweredCount === 0 && (
                      <span className="font-medium text-green-600 dark:text-green-400">
                        ✓ All answered
                      </span>
                    )}
                  </div>

                  {/* Question cards */}
                  {questions.map((question) => {
                    const hasOfficialAnswer = question.answers.some(
                      (a) =>
                        ["direct", "team_statement"].includes(a.answer_type) &&
                        !a.is_ai_generated
                    );
                    return (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        isAdmin={role === "admin"}
                        hasOfficialAnswer={hasOfficialAnswer}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
