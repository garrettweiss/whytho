"use client";

import { useState } from "react";
import Link from "next/link";
import { AnswerComposer } from "@/components/answers/answer-composer";
import { AnswerEditButton } from "@/components/dashboard/answer-edit-button";
import { DisputeClientButton } from "@/components/dashboard/dispute-button";

const QUALIFYING_THRESHOLD = 10;

export type InboxQuestion = {
  id: string;
  body: string;
  net_upvotes: number;
  week_number: number;
  created_at: string;
  answers: {
    id: string;
    answer_type: string;
    body: string;
    is_ai_generated: boolean;
    is_draft: boolean;
    created_at: string;
  }[];
};

type Filter = "all" | "qualifying" | "unanswered" | "answered";

function hasOfficialAnswer(q: InboxQuestion): boolean {
  return q.answers.some(
    (a) => ["direct", "team_statement"].includes(a.answer_type) && !a.is_ai_generated && !a.is_draft
  );
}

function QuestionCard({
  question,
  isAdmin,
  politicianSlug,
  isNew,
}: {
  question: InboxQuestion;
  isAdmin: boolean;
  politicianSlug: string;
  isNew: boolean;
}) {
  const officialAnswer = question.answers.find(
    (a) => ["direct", "team_statement"].includes(a.answer_type) && !a.is_ai_generated && !a.is_draft
  );
  const aiAnswer = question.answers.find(
    (a) => a.answer_type === "ai_analysis" && a.is_ai_generated
  );
  const isQualifying = question.net_upvotes >= QUALIFYING_THRESHOLD;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isNew && (
                <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  New
                </span>
              )}
              {isQualifying ? (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  ⚡ Qualifying
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {question.net_upvotes} vote{question.net_upvotes !== 1 ? "s" : ""} — not yet qualifying
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

      <div className="p-4 space-y-3">
        {officialAnswer && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              ✓ Official Response
            </p>
            <p className="text-sm leading-relaxed">{officialAnswer.body}</p>
            <AnswerEditButton
              answerId={officialAnswer.id}
              initialBody={officialAnswer.body}
              createdAt={officialAnswer.created_at}
            />
          </div>
        )}

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

        {!officialAnswer && (
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

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "qualifying", label: "Qualifying" },
  { key: "unanswered", label: "Unanswered" },
  { key: "answered", label: "Answered" },
];

export function DashboardQuestionInbox({
  questions,
  role,
  politicianSlug,
  cutoff48h,
}: {
  questions: InboxQuestion[];
  role: string;
  politicianSlug: string;
  cutoff48h: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const isAdmin = role === "admin";

  const qualifying = questions.filter((q) => q.net_upvotes >= QUALIFYING_THRESHOLD);
  const unansweredQualifying = qualifying.filter((q) => !hasOfficialAnswer(q));

  const filtered = questions.filter((q) => {
    if (filter === "qualifying") return q.net_upvotes >= QUALIFYING_THRESHOLD;
    if (filter === "unanswered") return !hasOfficialAnswer(q);
    if (filter === "answered") return hasOfficialAnswer(q);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.net_upvotes - a.net_upvotes);

  return (
    <div className="space-y-3">
      {/* Header + filter tabs */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">
              {questions.length} question{questions.length !== 1 ? "s" : ""} this week
            </span>
            {unansweredQualifying.length > 0 ? (
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                · {unansweredQualifying.length} qualifying unanswered
              </span>
            ) : qualifying.length > 0 ? (
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                · All qualifying answered ✓
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {qualifying.length} of {questions.length} questions have 10+ votes and count toward your response rate.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {FILTERS.map(({ key, label }) => {
            const count =
              key === "all" ? questions.length :
              key === "qualifying" ? qualifying.length :
              key === "unanswered" ? questions.filter((q) => !hasOfficialAnswer(q)).length :
              questions.filter((q) => hasOfficialAnswer(q)).length;

            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1 tabular-nums ${filter === key ? "text-foreground" : "text-muted-foreground"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question cards */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {filter === "qualifying"
              ? "No qualifying questions yet. Questions need 10+ net upvotes."
              : filter === "unanswered"
              ? "No unanswered questions — all caught up."
              : filter === "answered"
              ? "No answered questions yet."
              : "No questions this week yet."}
          </p>
          {filter === "qualifying" && (
            <p className="text-xs text-muted-foreground mt-1">
              Your public response rate is based on questions that reach 10+ votes.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              isAdmin={isAdmin}
              politicianSlug={politicianSlug}
              isNew={question.created_at > cutoff48h}
            />
          ))}
        </div>
      )}
    </div>
  );
}
