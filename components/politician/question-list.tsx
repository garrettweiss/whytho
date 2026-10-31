"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Enums } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/auth/use-user";
import { useOwnerMembership } from "@/lib/auth/use-owner-membership";
import { AnswerComposer } from "@/components/answers/answer-composer";
import { safeAnswerMediaUrl } from "@/components/answers/media-url";
import { AnswerMediaDisplay } from "@/components/answers/answer-media-display";
import { canVoteOnQuestion, isAIAnswer, isOfficialAnswer, isPublishedAnswer, mergeHydratedVotes, presentSources, safeExternalUrl, type VoteMap, type VoteValue } from "@/components/questions/answer-presentation";
import styles from "@/components/questions/face-questions.module.css";

type Appearance = "default" | "face";
type AnswerMedia = {
  id: string;
  media_type: "image" | "video" | "audio";
  public_url: string;
  file_name: string | null;
};

export type Answer = {
  id: string;
  answer_type: Enums<"answer_type">;
  body: string;
  is_ai_generated: boolean;
  is_draft?: boolean;
  ai_confidence: Enums<"ai_confidence"> | null;
  sources: unknown;
  is_disputed: boolean;
  created_at: string;
  answer_media?: AnswerMedia[];
};

type XAttribution = {
  author_handle: string;
  author_name: string | null;
  tweet_url: string;
} | null;

export type Question = {
  id: string;
  body: string;
  net_upvotes: number;
  is_seeded: boolean;
  source: string | null;
  status: Enums<"question_status">;
  submitted_by?: string | null;
  created_at: string;
  week_number: number;
  x_posts: XAttribution;
  answers: Answer[];
};

interface QuestionListProps {
  questions: Question[];
  politicianId: string;
  politicianSlug: string;
  politicianName: string;
  weekNumber: number;
  currentWeekNumber?: number;
  isHistorical?: boolean;
  period?: "week" | "month" | "year" | "all";
  isOwner?: boolean;
  ownerRole?: string;
  profileVerified?: boolean;
  appearance?: Appearance;
}

const CONFIDENCE_LABELS: Record<Enums<"ai_confidence">, string> = {
  high: "High confidence (3+ sources)",
  medium: "Medium confidence (1-2 sources)",
  low: "Low confidence (inference)",
  insufficient: "Insufficient public record",
};

function AnswerBlock({ answer, politicianName, appearance }: { answer: Answer; politicianName: string; appearance: Appearance }) {
  if (!isPublishedAnswer(answer)) return null;
  const isAI = isAIAnswer(answer);
  const isOfficial = isOfficialAnswer(answer);
  const sources = presentSources(answer.sources);
  const media = (answer.answer_media ?? []).filter((item) => safeAnswerMediaUrl(item.public_url));
  const insufficient = isAI && answer.ai_confidence === "insufficient";
  const face = appearance === "face";

  return (
    <section id={`answer-${answer.id}`} aria-label={isOfficial ? "Official response" : isAI ? "AI analysis" : "Published response"}
      className={face ? styles.answer : "mt-3 rounded-lg border px-4 py-3 text-sm space-y-2"}>
      <div className={face ? styles.answerLabels : "flex flex-wrap items-center gap-2"}>
        <p className={face ? (isOfficial ? styles.officialLabel : styles.answerLabel) : "text-xs font-semibold"}>
          {isOfficial ? "Official response" : isAI ? "AI Analysis of Public Record" : "Published response"}
        </p>
        {answer.is_disputed && <span className={face ? styles.disputed : "text-xs font-medium text-orange-600"}>Disputed: under review</span>}
      </div>
      {isAI && <p className={face ? styles.attribution : "text-xs text-muted-foreground"}>This is NOT a statement from {politicianName}.</p>}
      {isAI && answer.ai_confidence && !insufficient && (
        <p className={face ? styles.meta : "text-xs text-muted-foreground"}>{CONFIDENCE_LABELS[answer.ai_confidence]}</p>
      )}
      <p className={face ? styles.answerBody : "leading-relaxed whitespace-pre-wrap break-words"}>
        {insufficient ? "Insufficient public record to generate analysis." : answer.body}
      </p>
      {!insufficient && media.length > 0 && <AnswerMediaDisplay media={media} />}
      {sources.length > 0 && (
        <div className={face ? styles.sources : "pt-2 border-t"}>
          <p className={face ? styles.meta : "text-xs font-medium mb-1"}>Sources</p>
          <ul>
            {sources.map((source, index) => (
              <li key={index} className={face ? styles.source : "text-xs text-muted-foreground break-words"}>
                {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.title || source.url}</a> : source.title}
                {source.date && ` (${source.date})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "offensive", label: "Offensive or hateful" },
  { value: "off_topic", label: "Off topic" },
  { value: "duplicate", label: "Duplicate question" },
  { value: "other", label: "Other" },
] as const;

function ReportButton({ questionId, questionBody, appearance }: { questionId: string; questionBody: string; appearance: Appearance }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reportedRef = useRef<HTMLSpanElement>(null);
  const face = appearance === "face";
  const menuId = `report-options-${questionId}`;

  useEffect(() => { if (submitted) reportedRef.current?.focus(); }, [submitted]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(menuId)} button`)?.focus();
    function outside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, menuId]);

  function handleReport(reason: string) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/questions/${questionId}/report`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(response.status === 401 ? "Sign in to report this question." : data.error ?? "Could not report this question. Try again.");
          return;
        }
        setSubmitted(true);
        setOpen(false);
      } catch {
        setError("We could not confirm your report. Please try again later.");
      }
    });
  }

  if (submitted) return <span ref={reportedRef} tabIndex={-1} role="status" className={face ? styles.meta : "text-xs text-muted-foreground"}>Reported</span>;

  return (
    <div ref={menuRef} className={face ? styles.report : "relative"}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)}
        aria-label={`Report question: ${questionBody}`} aria-expanded={open} aria-controls={open ? menuId : undefined}
        className={face ? styles.reportButton : "flex min-h-11 min-w-11 items-center justify-center text-xs text-muted-foreground hover:text-foreground"}>
        Report
      </button>
      {open && (
        <div id={menuId} role="group" aria-label="Report reason" className={face ? styles.reportOptions : "absolute right-0 top-full z-20 w-52 rounded-lg border bg-popover shadow-lg"}>
          <p className={face ? styles.reportTitle : "px-3 pt-3 text-xs font-medium"}>Report reason</p>
          {REPORT_REASONS.map((reason) => (
            <button key={reason.value} type="button" onClick={() => handleReport(reason.value)} disabled={isPending}
              className={face ? styles.reportOption : "w-full min-h-11 text-left px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"}>
              {reason.label}
            </button>
          ))}
          {error && <p role="alert" className={face ? styles.reportError : "px-3 py-2 text-xs text-destructive"}>{error}</p>}
        </div>
      )}
    </div>
  );
}

function formatWeekBadge(weekNumber: number): string {
  return `Week ${weekNumber % 100}, ${Math.floor(weekNumber / 100)}`;
}

function QuestionCard({ question, politicianSlug, politicianName, isHistorical, showWeekBadge, votingDisabled, votesReady, hydratedVote, voteIdentity, onVoteSaved, onVoteSuccess, isOwner, ownerRole, profileVerified, appearance }: {
  question: Question;
  politicianSlug: string;
  politicianName: string;
  isHistorical: boolean;
  showWeekBadge: boolean;
  votingDisabled: boolean;
  votesReady: boolean;
  hydratedVote: VoteValue;
  voteIdentity: string | null;
  onVoteSaved: (questionId: string, value: VoteValue, originIdentity: string | null) => void;
  onVoteSuccess: () => void;
  isOwner: boolean;
  ownerRole?: string;
  profileVerified: boolean;
  appearance: Appearance;
}) {
  const answers = question.answers.filter(isPublishedAnswer);
  const [votes, setVotes] = useState(question.net_upvotes);
  const [userVote, setUserVote] = useState<VoteValue>(hydratedVote);
  const [isPending, startTransition] = useTransition();
  const [voteError, setVoteError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(answers.length > 0);
  const voteInFlight = useRef(false);
  const latestServerVotes = useRef(question.net_upvotes);
  const face = appearance === "face";
  const hasOfficialAnswer = answers.some(isOfficialAnswer);
  const hasAIAnalysis = answers.some(isAIAnswer);
  const panelId = `answers-${question.id}`;
  const voteStatusId = `vote-status-${question.id}`;
  const originalPostUrl = safeExternalUrl(question.x_posts?.tweet_url);

  useEffect(() => {
    latestServerVotes.current = question.net_upvotes;
    setVotes(question.net_upvotes);
  }, [question.net_upvotes]);

  useEffect(() => {
    if (!voteInFlight.current && votesReady) setUserVote(hydratedVote);
  }, [hydratedVote, voteIdentity, votesReady, isPending]);

  function handleVote(value: 1 | -1) {
    if (votingDisabled || !votesReady || isHistorical || voteInFlight.current) return;
    voteInFlight.current = true;
    setVoteError(null);
    const previousVote = userVote;
    const previousVotes = votes;
    const serverVotesBefore = latestServerVotes.current;
    const next = userVote === value ? 0 : value;
    const delta = next - userVote;
    setVotes((count) => count + delta);
    setUserVote(next);
    function rollBackVote() {
      setVotes(latestServerVotes.current !== serverVotesBefore ? latestServerVotes.current : previousVotes);
      setUserVote(previousVote);
    }
    startTransition(async () => {
      try {
        const payload = JSON.stringify({ question_id: question.id, week_number: question.week_number, value: next === 0 ? null : next });
        let response = await fetch("/api/votes", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
        });
        // Anonymous voting still goes through the server's session rate limit.
        if (response.status === 401) {
          const anonymousResponse = await fetch("/api/auth/anonymous", { method: "POST" });
          if (anonymousResponse.ok) {
            response = await fetch("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
          }
        }
        if (!response.ok) {
          rollBackVote();
          setVoteError(response.status === 409 ? "Your vote could not be saved. Refresh and try again." : response.status === 429 ? "Voting is temporarily limited. Try again in a few minutes." : "Your vote was not saved. Please try again.");
        } else {
          onVoteSaved(question.id, next, voteIdentity);
          onVoteSuccess();
        }
      } catch {
        rollBackVote();
        setVoteError("We could not confirm your vote. Refresh to check it before trying again.");
      } finally {
        voteInFlight.current = false;
      }
    });
  }

  return (
    <article id={`question-${question.id}`} className={face ? styles.question : "rounded-xl border bg-card shadow-sm"}>
      <div className={face ? styles.questionRow : "flex gap-3 p-4"}>
        <div className={face ? styles.voteColumn : "flex flex-col items-center gap-1 shrink-0"}>
          <button type="button" onClick={() => handleVote(1)} disabled={isPending || !votesReady || votingDisabled || isHistorical}
            aria-pressed={votesReady ? userVote === 1 : undefined} aria-label={`Upvote question: ${question.body}`} aria-describedby={voteStatusId}
            className={face ? styles.voteButton : "flex h-11 w-11 items-center justify-center rounded-md text-sm hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:opacity-40"}>
            <span aria-hidden="true">↑</span>
          </button>
          <span className={face ? styles.voteCount : "text-sm font-semibold tabular-nums"} aria-label={`${votes} net votes`}>{votes}</span>
          <button type="button" onClick={() => handleVote(-1)} disabled={isPending || !votesReady || votingDisabled || isHistorical}
            aria-pressed={votesReady ? userVote === -1 : undefined} aria-label={`Downvote question: ${question.body}`} aria-describedby={voteStatusId}
            className={face ? styles.voteButton : "flex h-11 w-11 items-center justify-center rounded-md text-sm hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:opacity-40"}>
            <span aria-hidden="true">↓</span>
          </button>
        </div>
        <div className={face ? styles.questionContent : "flex-1 min-w-0"}>
          <div className={face ? styles.questionMeta : "flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2"}>
            {showWeekBadge && <span>{formatWeekBadge(question.week_number)}</span>}
            {question.is_seeded && <span>Suggested Question: AI-generated from public record</span>}
            {question.source === "x" && question.x_posts && (
              <span>Asked by <a href={`https://x.com/${encodeURIComponent(question.x_posts.author_handle)}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">@{question.x_posts.author_handle}</a> on X{originalPostUrl && <> · <a href={originalPostUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">View original</a></>}</span>
            )}
          </div>
          <h3 className={face ? styles.questionBody : "font-medium leading-snug whitespace-pre-wrap break-words"}>{question.body}</h3>
          <div className={face ? styles.questionActions : "mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"}>
            <span className={face && hasOfficialAnswer ? styles.officialLabel : undefined}>{hasOfficialAnswer ? "Official response recorded" : "No official response recorded"}</span>
            {answers.length > 0 && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={panelId}
              className={face ? styles.disclosure : "min-h-11 underline underline-offset-2"}>
              {expanded ? "Hide" : "Read"} {hasOfficialAnswer && hasAIAnalysis ? "responses and AI analysis" : hasOfficialAnswer ? "response" : hasAIAnalysis ? "AI analysis" : "published response"}{answers.length > 1 ? ` (${answers.length})` : ""} <span aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>}
            {!isHistorical && !isOwner && <ReportButton questionId={question.id} questionBody={question.body} appearance={appearance} />}
          </div>
          <p id={voteStatusId} role="status" aria-live="polite" className={voteError ? (face ? styles.error : "text-xs text-destructive") : (votingDisabled ? (face ? styles.meta : "text-xs text-muted-foreground") : "sr-only")}>
            {voteError ?? (votingDisabled ? "Voting is closed for this week." : isPending ? "Saving your vote." : !votesReady ? "Your previous votes have not loaded yet." : "Voting is open for the current week.")}
          </p>
          {answers.length > 0 && <div id={panelId} hidden={!expanded} onKeyDown={(event) => {
            if (event.key === "Escape") {
              setExpanded(false);
              document.querySelector<HTMLButtonElement>(`[aria-controls="${panelId}"]`)?.focus();
            }
          }}>{answers.map((answer) => <AnswerBlock key={answer.id} answer={answer} politicianName={politicianName} appearance={appearance} />)}</div>}
          {isOwner && !isHistorical && !hasOfficialAnswer && <div className={face ? styles.ownerComposer : "mt-3 pt-3 border-t"}>
            <AnswerComposer questionId={question.id} questionBody={question.body} politicianSlug={politicianSlug} politicianName={politicianName} isAdmin={ownerRole === "admin"} profileVerified={profileVerified} canPublish={profileVerified && ["admin", "editor"].includes(ownerRole ?? "")} />
          </div>}
        </div>
      </div>
    </article>
  );
}

const PROFILE_PROMPT_KEY = "whytho_profile_prompt_dismissed";

export function QuestionList({ questions, politicianId, politicianSlug, politicianName, weekNumber, currentWeekNumber, isHistorical = false, period = "week", isOwner: isOwnerProp, ownerRole: ownerRoleProp, profileVerified = false, appearance = "default" }: QuestionListProps) {
  // Ownership stays client-side so the public profile can remain cached.
  const { user, isLoading: isUserLoading } = useUser();
  const membership = useOwnerMembership(politicianId, user);
  const isOwner = isOwnerProp ?? membership.isOwner;
  const ownerRole = ownerRoleProp ?? membership.ownerRole ?? undefined;
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);
  const [showProfileBanner, setShowProfileBanner] = useState(false);
  const hasCheckedProfile = useRef(false);
  const face = appearance === "face";
  const activeWeek = currentWeekNumber ?? weekNumber;
  const voteIdentity = user?.id ?? null;
  const currentIdentity = useRef(voteIdentity);
  currentIdentity.current = voteIdentity;
  const savedVotes = useRef<{ identity: string | null; version: number; writes: Record<string, { value: VoteValue; version: number }> }>({ identity: voteIdentity, version: 0, writes: {} });
  const [voteRetry, setVoteRetry] = useState(0);
  const [voteHydration, setVoteHydration] = useState<{ identity: string | null; key: string; status: "loading" | "ready" | "error"; votes: VoteMap }>({ identity: null, key: "", status: "loading", votes: {} });
  const currentQuestionIdsKey = localQuestions.filter((question) => canVoteOnQuestion(question.week_number, activeWeek, isHistorical)).map((question) => question.id).sort().join(",");

  useEffect(() => {
    if (isUserLoading) return;
    let active = true;
    const controller = new AbortController();
    const ids = currentQuestionIdsKey ? currentQuestionIdsKey.split(",") : [];
    if (savedVotes.current.identity !== voteIdentity) savedVotes.current = { identity: voteIdentity, version: 0, writes: {} };
    const readStartedAt = savedVotes.current.version;
    setVoteHydration({ identity: voteIdentity, key: currentQuestionIdsKey, status: voteIdentity && ids.length ? "loading" : "ready", votes: {} });
    if (!voteIdentity || ids.length === 0) return;
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    async function loadVotes() {
      try {
        const supabase = createClient();
        const rows: { question_id: string; value: number | null }[] = [];
        // Visible lists are bounded server-side. Chunking also covers realtime inserts.
        for (let offset = 0; offset < ids.length; offset += 200) {
          const { data, error } = await supabase.from("votes").select("question_id, value")
            .eq("user_id", voteIdentity!).eq("week_number", activeWeek)
            .in("question_id", ids.slice(offset, offset + 200)).abortSignal(controller.signal);
          if (error) throw error;
          rows.push(...(data ?? []));
        }
        if (!active) return;
        const overrides: VoteMap = {};
        if (savedVotes.current.identity === voteIdentity) {
          for (const [questionId, write] of Object.entries(savedVotes.current.writes)) {
            if (write.version > readStartedAt) overrides[questionId] = write.value;
          }
        }
        setVoteHydration({ identity: voteIdentity, key: currentQuestionIdsKey, status: "ready", votes: mergeHydratedVotes(rows, ids, overrides) });
      } catch {
        if (active) setVoteHydration({ identity: voteIdentity, key: currentQuestionIdsKey, status: "error", votes: {} });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void loadVotes();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [activeWeek, currentQuestionIdsKey, isUserLoading, voteIdentity, voteRetry]);

  const votesReady = !isUserLoading && (!voteIdentity || (voteHydration.identity === voteIdentity && voteHydration.key === currentQuestionIdsKey && voteHydration.status === "ready"));
  const votesFailed = voteHydration.identity === voteIdentity && voteHydration.key === currentQuestionIdsKey && voteHydration.status === "error";
  const handleVoteSaved = useCallback((questionId: string, value: VoteValue, originIdentity: string | null) => {
    const identity = currentIdentity.current;
    // The first anonymous vote creates its identity during the request.
    if (originIdentity && originIdentity !== identity) return;
    if (savedVotes.current.identity !== identity) savedVotes.current = { identity, version: 0, writes: {} };
    savedVotes.current.version += 1;
    savedVotes.current.writes[questionId] = { value, version: savedVotes.current.version };
    setVoteHydration((previous) => previous.identity === identity ? { ...previous, votes: { ...previous.votes, [questionId]: value } } : previous);
  }, []);

  useEffect(() => { setLocalQuestions(questions); }, [questions]);

  const handleVoteSuccess = useCallback(async () => {
    if (hasCheckedProfile.current) return;
    hasCheckedProfile.current = true;
    try {
      if (localStorage.getItem(PROFILE_PROMPT_KEY)) return;
      const response = await fetch("/api/settings/profile");
      if (!response.ok) return;
      const profile = (await response.json()) as { state_code: string | null };
      if (!profile.state_code) setShowProfileBanner(true);
    } catch {
      // A profile suggestion must never interrupt voting.
    }
  }, []);

  useEffect(() => {
    if (isHistorical || period !== "week") return;
    const supabase = createClient();
    const channel = supabase.channel(`questions:${politicianId}:${weekNumber}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "questions", filter: `politician_id=eq.${politicianId}` }, (payload) => {
        const updated = payload.new as { id: string; net_upvotes: number; status: string; week_number: number };
        if (updated.week_number !== weekNumber) return;
        if (updated.status !== "active") {
          setLocalQuestions((previous) => previous.filter((question) => question.id !== updated.id));
          return;
        }
        setLocalQuestions((previous) => previous.map((question) => question.id === updated.id ? { ...question, net_upvotes: updated.net_upvotes } : question));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "questions", filter: `politician_id=eq.${politicianId}` }, (payload) => {
        const question = payload.new as Question;
        if (question.week_number !== weekNumber || question.status !== "active") return;
        setLocalQuestions((previous) => previous.some((item) => item.id === question.id) ? previous : [...previous, { ...question, x_posts: null, answers: [] }]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [politicianId, weekNumber, isHistorical, period]);

  const periodLabels = { week: "This week's questions", month: "Questions from the last 28 days", year: "Questions from the last 365 days", all: "All questions" };
  const emptyMessages = { week: "No questions this week", month: "No questions in the last 28 days", year: "No questions in the last 365 days", all: "No questions yet" };
  const title = isHistorical ? `${formatWeekBadge(weekNumber)} questions` : periodLabels[period];
  const sorted = [...localQuestions].sort((first, second) => second.net_upvotes - first.net_upvotes);
  const qualifying = sorted.filter((question) => question.net_upvotes >= 10);

  function renderQuestion(question: Question) {
    return <QuestionCard key={question.id} question={question} politicianSlug={politicianSlug} politicianName={politicianName}
      isHistorical={isHistorical} showWeekBadge={period !== "week" && !isHistorical}
      votingDisabled={!canVoteOnQuestion(question.week_number, activeWeek, isHistorical)} onVoteSuccess={handleVoteSuccess}
      votesReady={votesReady} hydratedVote={voteHydration.identity === voteIdentity ? voteHydration.votes[question.id] ?? 0 : 0}
      voteIdentity={voteIdentity} onVoteSaved={handleVoteSaved}
      isOwner={isOwner} ownerRole={ownerRole} profileVerified={profileVerified} appearance={appearance} />;
  }

  return (
    <section className={face ? styles.list : "space-y-3"} aria-labelledby="question-list-heading">
      {showProfileBanner && <div className={face ? styles.profilePrompt : "flex items-center justify-between gap-3 rounded-xl border px-4 py-3"}>
        <p>Add your location for personalized results. <Link href="/account?tab=profile" className="underline underline-offset-2">Set up profile</Link></p>
        <button type="button" aria-label="Dismiss location suggestion" onClick={() => {
          setShowProfileBanner(false);
          try { localStorage.setItem(PROFILE_PROMPT_KEY, "1"); } catch { /* Optional preference. */ }
        }} className={face ? styles.dismiss : "min-h-11 min-w-11"}>×</button>
      </div>}
      <div className={face ? styles.listHeading : "flex flex-wrap items-center justify-between gap-2"}>
        <h2 id="question-list-heading" className={face ? styles.listTitle : "text-lg font-semibold"}>{title}</h2>
        <span className={face ? styles.meta : "text-sm text-muted-foreground"}>{localQuestions.length} question{localQuestions.length !== 1 ? "s" : ""} shown</span>
      </div>
      {!!currentQuestionIdsKey && !votesReady && <div role="status" className={face ? styles.profilePrompt : "flex flex-wrap items-center gap-3 text-sm"}>
        <p>{votesFailed ? "We could not load your previous votes. Voting is paused to keep your selections accurate." : "Loading your previous votes…"}</p>
        {votesFailed && <button type="button" className={face ? styles.textButton : "min-h-11 underline"} onClick={() => setVoteRetry((value) => value + 1)}>Retry loading votes</button>}
      </div>}
      {sorted.length === 0 ? <div className={face ? styles.empty : "rounded-xl border bg-card p-8 space-y-2"}>
        <p>{isHistorical ? `No questions recorded for ${formatWeekBadge(weekNumber).toLowerCase()}.` : emptyMessages[period]}</p>
        <p className={face ? styles.meta : "text-sm text-muted-foreground"}>{isHistorical || period !== "week" ? "Choose another period to explore the record." : "Have something to ask? Add your question for this week."}</p>
      </div> : <div className={face ? styles.group : "space-y-2"}>
        {sorted.map((question, index) => <div key={question.id}>
          {(period === "week" || isHistorical) && qualifying.length > 0 && (index === 0 || index === qualifying.length) &&
            <p className={face ? styles.groupLabel : "text-sm font-medium text-muted-foreground"}>{index === 0 ? "10+ net votes" : "More questions"}</p>}
          {renderQuestion(question)}
        </div>)}
      </div>}
    </section>
  );
}
