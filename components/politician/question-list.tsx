"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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
  currentWeekNumber?: number;
  isHistorical?: boolean;
  period?: "week" | "month" | "year" | "all";
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
      <p className="leading-relaxed">{answer.body}</p>
      {isAI && Array.isArray(answer.sources) && answer.sources.length > 0 && (
        <div className="pt-1 border-t border-muted">
          <p className="text-xs text-muted-foreground font-medium mb-1">Sources:</p>
          <ul className="space-y-0.5">
            {(answer.sources as Array<{ url?: string; title?: string; date?: string }>).map((src, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {src.url ? (
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-2">
                    {src.title ?? src.url}{src.date && ` (${src.date})`}
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

// ─── Report Button ────────────────────────────────────────────────────────────

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "offensive", label: "Offensive or hateful" },
  { value: "off_topic", label: "Off topic" },
  { value: "duplicate", label: "Duplicate question" },
  { value: "other", label: "Other" },
] as const;

function ReportButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleReport(reason: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/questions/${questionId}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to report. Please try again.");
          return;
        }
        setSubmitted(true);
        setOpen(false);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (submitted) {
    return <span className="text-xs text-muted-foreground">✓ Reported</span>;
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Report this question"
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors text-xs"
      >
        ⚑
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <p className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">Report reason</p>
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => handleReport(r.value)}
              disabled={isPending}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
          {error && <p className="px-3 py-2 text-xs text-destructive border-t">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Question Card ────────────────────────────────────────────────────────────

function formatWeekBadge(weekNumber: number): string {
  const year = Math.floor(weekNumber / 100);
  const week = weekNumber % 100;
  return `Week ${week}, ${year}`;
}

function QuestionCard({
  question,
  politicianId: _politicianId,
  weekNumber,
  isHistorical = false,
  showWeekBadge = false,
  votingDisabled = false,
  onVoteSuccess,
}: {
  question: Question;
  politicianId: string;
  weekNumber: number;
  isHistorical?: boolean;
  showWeekBadge?: boolean;
  votingDisabled?: boolean;
  onVoteSuccess?: () => void;
}) {
  const [votes, setVotes] = useState(question.net_upvotes);
  const [userVote, setUserVote] = useState<1 | -1 | 0>(0);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(question.answers.length > 0);

  useEffect(() => {
    if (!isPending) setVotes(question.net_upvotes);
  }, [question.net_upvotes, isPending]);

  const hasAnswers = question.answers.length > 0;

  async function handleVote(value: 1 | -1) {
    const next = userVote === value ? 0 : value;
    const delta = next - userVote;
    setVotes((v) => v + delta);
    setUserVote(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/votes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question_id: question.id, week_number: weekNumber, value: next === 0 ? null : next }),
        });
        if (!res.ok) { setVotes((v) => v - delta); setUserVote(userVote); }
        else { onVoteSuccess?.(); }
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
          <button onClick={() => handleVote(1)} disabled={isPending || isHistorical || votingDisabled} aria-label="Upvote"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${userVote === 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"} disabled:opacity-40 disabled:cursor-not-allowed`}>
            ▲
          </button>
          <span className="text-sm font-semibold tabular-nums w-7 text-center">{votes}</span>
          <button onClick={() => handleVote(-1)} disabled={isPending || isHistorical || votingDisabled} aria-label="Downvote"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${userVote === -1 ? "bg-destructive text-destructive-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"} disabled:opacity-40 disabled:cursor-not-allowed`}>
            ▼
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {question.is_seeded && (
            <p className="text-xs text-muted-foreground mb-1">💡 WhyTho suggested question</p>
          )}
          {showWeekBadge && (
            <p className="text-xs text-muted-foreground/70 mb-1">{formatWeekBadge(question.week_number)}</p>
          )}
          <p className="font-medium leading-snug">{question.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {votes >= 10 && <span className="text-amber-600 font-medium">⚡ Qualifying</span>}
            {hasAnswers ? (
              <button onClick={() => setExpanded((e) => !e)} className="hover:text-foreground underline-offset-2 hover:underline">
                {expanded ? "Hide" : "Show"} response ({question.answers.length})
              </button>
            ) : (
              <span className="text-muted-foreground/70">No response yet</span>
            )}
          </div>
          {expanded && hasAnswers && (
            <div className="mt-1 space-y-2">
              {question.answers.map((answer) => <AnswerBlock key={answer.id} answer={answer} />)}
            </div>
          )}
        </div>

        {/* Report button */}
        {!isHistorical && (
          <div className="shrink-0">
            <ReportButton questionId={question.id} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Question List ────────────────────────────────────────────────────────────

const PROFILE_PROMPT_KEY = "whytho_profile_prompt_dismissed";

export function QuestionList({ questions, politicianId, weekNumber, currentWeekNumber: _currentWeekNumber, isHistorical = false, period = "week" }: QuestionListProps) {
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);
  const [showProfileBanner, setShowProfileBanner] = useState(false);
  const hasCheckedProfile = useRef(false);

  useEffect(() => { setLocalQuestions(questions); }, [questions]);

  const handleVoteSuccess = useCallback(async () => {
    if (hasCheckedProfile.current) return;
    if (typeof window !== "undefined" && localStorage.getItem(PROFILE_PROMPT_KEY)) return;
    hasCheckedProfile.current = true;
    try {
      const res = await fetch("/api/settings/profile");
      if (!res.ok) return; // 401 = anonymous/not logged in
      const profile = (await res.json()) as { state_code: string | null };
      if (!profile.state_code) setShowProfileBanner(true);
    } catch {
      // silently ignore
    }
  }, []);

  // Realtime subscription — only active on the current Week tab
  useEffect(() => {
    if (isHistorical || period !== "week") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`questions:${politicianId}:${weekNumber}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "questions", filter: `politician_id=eq.${politicianId}` },
        (payload) => {
          const updated = payload.new as { id: string; net_upvotes: number; status: string; week_number: number };
          if (updated.week_number !== weekNumber) return;
          if (updated.status !== "active") {
            setLocalQuestions((prev) => prev.filter((q) => q.id !== updated.id));
            return;
          }
          setLocalQuestions((prev) => prev.map((q) => q.id === updated.id ? { ...q, net_upvotes: updated.net_upvotes } : q));
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "questions", filter: `politician_id=eq.${politicianId}` },
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
    return () => { supabase.removeChannel(channel); };
  }, [politicianId, weekNumber, isHistorical, period]);

  const periodLabel: Record<string, string> = {
    week:  "This Week's Questions",
    month: "Questions This Month",
    year:  "Questions This Year",
    all:   "All Questions",
  };

  const emptyMessage: Record<string, string> = {
    week:  "No questions yet this week",
    month: "No questions in the last 30 days",
    year:  "No questions this year",
    all:   "No questions yet",
  };

  const profileBanner = showProfileBanner ? (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3">
      <p className="text-sm text-blue-800 dark:text-blue-300">
        📍 Add your location for personalized results →{" "}
        <Link
          href="/account?tab=profile"
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Set up profile
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setShowProfileBanner(false);
          localStorage.setItem(PROFILE_PROMPT_KEY, "1");
        }}
        className="shrink-0 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200 text-sm leading-none"
      >
        ✕
      </button>
    </div>
  ) : null;

  if (localQuestions.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-2 shadow-sm">
        <p className="font-medium">{emptyMessage[period] ?? emptyMessage.week}</p>
        <p className="text-sm text-muted-foreground">Be the first to ask something. Silence is its own answer.</p>
      </div>
    );
  }

  const sorted = [...localQuestions].sort((a, b) => b.net_upvotes - a.net_upvotes);
  const showWeekBadge = period !== "week" && !isHistorical;

  // For week view: split into qualifying / non-qualifying sections
  if (period === "week" || isHistorical) {
    const qualifying = sorted.filter((q) => q.net_upvotes >= 10);
    const nonQualifying = sorted.filter((q) => q.net_upvotes < 10);

    return (
      <div className="space-y-3">
        {profileBanner}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{periodLabel[period] ?? periodLabel.week}</h2>
          <span className="text-sm text-muted-foreground">
            {localQuestions.length} question{localQuestions.length !== 1 ? "s" : ""}
            {qualifying.length > 0 && ` · ${qualifying.length} qualifying`}
          </span>
        </div>
        {qualifying.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">⚡ Qualifying (10+ votes)</p>
            {qualifying.map((q) => (
              <QuestionCard key={q.id} question={q} politicianId={politicianId} weekNumber={weekNumber} isHistorical={isHistorical} onVoteSuccess={handleVoteSuccess} />
            ))}
          </div>
        )}
        {nonQualifying.length > 0 && (
          <div className="space-y-2">
            {qualifying.length > 0 && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Other Questions</p>}
            {nonQualifying.map((q) => (
              <QuestionCard key={q.id} question={q} politicianId={politicianId} weekNumber={weekNumber} isHistorical={isHistorical} onVoteSuccess={handleVoteSuccess} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // For month / year / all — flat sorted list, week badge shown
  return (
    <div className="space-y-3">
      {profileBanner}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{periodLabel[period]}</h2>
        <span className="text-sm text-muted-foreground">
          {localQuestions.length} question{localQuestions.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {sorted.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            politicianId={politicianId}
            weekNumber={q.week_number}
            isHistorical={false}
            showWeekBadge={showWeekBadge}
            onVoteSuccess={handleVoteSuccess}
          />
        ))}
      </div>
    </div>
  );
}
