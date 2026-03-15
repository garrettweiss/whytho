"use client";

import { useState, useTransition, useEffect } from "react";
import { Enums } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Answer = {
  id: string;
  answer_type: Enums<"answer_type">;
  body: string;
  is_ai_generated: boolean;
  ai_confidence: Enums<"ai_confidence"> | null;
  sources: unknown;
  is_disputed: boolean;
  created_at: string;
};

type Question = {
  id: string;
  body: string;
  net_upvotes: number;
  is_seeded: boolean;
  status: Enums<"question_status">;
  submitted_by: string | null;
  created_at: string;
  week_number: number;
  answers: Answer[];
};

interface QuestionListProps {
  questions: Question[];
  politicianId: string;
  weekNumber: number;
  isHistorical?: boolean;
}

// ─── Answer Display ───────────────────────────────────────────────────────────

const CONFIDENCE_LABELS: Record<Enums<"ai_confidence">, string> = {
  high: "High confidence (3+ sources)",
  medium: "Medium confidence (1-2 sources)",
  low: "Low confidence (inference)",
  insufficient: "Insufficient public record",
};

function AnswerBlock({ answer }: { answer: Answer }) {
  const isAI = answer.is_ai_generated;
  const isDirect = answer.answer_type === "direct";

  if (answer.answer_type === "ai_analysis" && answer.ai_confidence === "insufficient") {
    return (
      <div className="mt-3 rounded-lg border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground italic">
        🤖 Insufficient public record to generate analysis.
      </div>
    );
  }

  return (
    <div className={`mt-3 rounded-lg border px-4 py-3 text-sm space-y-2 ${
      isDirect
        ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
        : "border-muted bg-muted/30"
    }`}>
      {/* Label */}
      <div className="flex flex-wrap items-center gap-2">
        {isAI ? (
          <span className="text-xs font-medium text-muted-foreground">
            🤖 AI Analysis of Public Record. This is NOT a statement from the politician.
          </span>
        ) : isDirect ? (
          <span className="text-xs font-semibold text-green-700 dark:text-green-400">
            ✓ Official Response
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            Team Statement
          </span>
        )}

        {answer.is_disputed && (
          <span className="text-xs font-medium text-orange-600">
            ⚠️ Disputed — under review
          </span>
        )}

        {isAI && answer.ai_confidence && answer.ai_confidence !== "insufficient" && (
          <span className="text-xs text-muted-foreground">
            · {CONFIDENCE_LABELS[answer.ai_confidence]}
          </span>
        )}
      </div>

      {/* Body */}
      <p className="leading-relaxed">{answer.body}</p>

      {/* Sources */}
      {isAI && Array.isArray(answer.sources) && answer.sources.length > 0 && (
        <div className="pt-1 border-t border-muted">
          <p className="text-xs text-muted-foreground font-medium mb-1">Sources:</p>
          <ul className="space-y-0.5">
            {(answer.sources as Array<{ url?: string; title?: string; date?: string }>).map((src, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {src.url ? (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline underline-offset-2"
                  >
                    {src.title ?? src.url}
                    {src.date && ` (${src.date})`}
                  </a>
                ) : (
                  <span>{src.title}{src.date && ` (${src.date})`}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Question Card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  politicianId: _politicianId,
  weekNumber,
  isHistorical = false,
}: {
  question: Question;
  politicianId: string;
  weekNumber: number;
  isHistorical?: boolean;
}) {
  const [votes, setVotes] = useState(question.net_upvotes);
  const [userVote, setUserVote] = useState<1 | -1 | 0>(0);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(question.answers.length > 0);

  // Sync realtime net_upvotes into local state (skip while optimistic update in flight)
  useEffect(() => {
    if (!isPending) {
      setVotes(question.net_upvotes);
    }
  }, [question.net_upvotes, isPending]);

  const hasAnswers = question.answers.length > 0;

  async function handleVote(value: 1 | -1) {
    const next = userVote === value ? 0 : value;
    const delta = next - userVote;

    // Optimistic update
    setVotes((v) => v + delta);
    setUserVote(next);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/votes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: question.id,
            week_number: weekNumber,
            value: next === 0 ? null : next, // null = remove vote
          }),
        });

        if (!res.ok) {
          // Roll back on error
          setVotes((v) => v - delta);
          setUserVote(userVote);
        }
      } catch {
        setVotes((v) => v - delta);
        setUserVote(userVote);
      }
    });
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex gap-3 p-4">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <button
            onClick={() => handleVote(1)}
            disabled={isPending || isHistorical}
            aria-label="Upvote"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${
              userVote === 1
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            ▲
          </button>
          <span className="text-sm font-semibold tabular-nums w-7 text-center">
            {votes}
          </span>
          <button
            onClick={() => handleVote(-1)}
            disabled={isPending || isHistorical}
            aria-label="Downvote"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${
              userVote === -1
                ? "bg-destructive text-destructive-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            ▼
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Seeded label */}
          {question.is_seeded && (
            <p className="text-xs text-muted-foreground mb-1">
              📋 Suggested Question — AI-generated from public record
            </p>
          )}

          {/* Question body */}
          <p className="font-medium leading-snug">{question.body}</p>

          {/* Meta */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {votes >= 10 && (
              <span className="text-amber-600 font-medium">⚡ Qualifying</span>
            )}
            {hasAnswers ? (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {expanded ? "Hide" : "Show"} response ({question.answers.length})
              </button>
            ) : (
              <span className="text-muted-foreground/70">No response yet</span>
            )}
          </div>

          {/* Answers */}
          {expanded && hasAnswers && (
            <div className="mt-1 space-y-2">
              {question.answers.map((answer) => (
                <AnswerBlock key={answer.id} answer={answer} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Question List ────────────────────────────────────────────────────────────

export function QuestionList({ questions, politicianId, weekNumber, isHistorical = false }: QuestionListProps) {
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);

  // Keep in sync when server re-renders (after router.refresh())
  useEffect(() => {
    setLocalQuestions(questions);
  }, [questions]);

  // Supabase Realtime — live vote counts + new questions (current week only)
  useEffect(() => {
    if (isHistorical) return; // no realtime on archive views — intentional

    const supabase = createClient();

    const channel = supabase
      .channel(`questions:${politicianId}:${weekNumber}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "questions",
          filter: `politician_id=eq.${politicianId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            net_upvotes: number;
            status: string;
            week_number: number;
          };
          // Only care about the current week
          if (updated.week_number !== weekNumber) return;
          if (updated.status !== "active") {
            setLocalQuestions((prev) => prev.filter((q) => q.id !== updated.id));
            return;
          }
          setLocalQuestions((prev) =>
            prev.map((q) =>
              q.id === updated.id ? { ...q, net_upvotes: updated.net_upvotes } : q
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "questions",
          filter: `politician_id=eq.${politicianId}`,
        },
        (payload) => {
          const newQ = payload.new as Question;
          if (newQ.week_number !== weekNumber || newQ.status !== "active") return;
          setLocalQuestions((prev) => {
            if (prev.find((q) => q.id === newQ.id)) return prev;
            return [...prev, { ...newQ, answers: [] }];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [politicianId, weekNumber, isHistorical]);

  if (localQuestions.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-2 shadow-sm">
        <p className="font-medium">No questions yet this week</p>
        <p className="text-sm text-muted-foreground">
          Be the first to ask something. Silence is its own answer.
        </p>
      </div>
    );
  }

  // Sort by net_upvotes descending (realtime updates can change order)
  const sorted = [...localQuestions].sort((a, b) => b.net_upvotes - a.net_upvotes);
  const qualifying = sorted.filter((q) => q.net_upvotes >= 10);
  const nonQualifying = sorted.filter((q) => q.net_upvotes < 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">This Week&apos;s Questions</h2>
        <span className="text-sm text-muted-foreground">
          {localQuestions.length} question{localQuestions.length !== 1 ? "s" : ""}
          {qualifying.length > 0 && ` · ${qualifying.length} qualifying`}
        </span>
      </div>

      {qualifying.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">
            ⚡ Qualifying (10+ votes)
          </p>
          {qualifying.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              politicianId={politicianId}
              weekNumber={weekNumber}
              isHistorical={isHistorical}
            />
          ))}
        </div>
      )}

      {nonQualifying.length > 0 && (
        <div className="space-y-2">
          {qualifying.length > 0 && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Other Questions
            </p>
          )}
          {nonQualifying.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              politicianId={politicianId}
              weekNumber={weekNumber}
              isHistorical={isHistorical}
            />
          ))}
        </div>
      )}
    </div>
  );
}
