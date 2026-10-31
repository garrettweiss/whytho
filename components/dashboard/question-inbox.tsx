"use client";

import { useState } from "react";
import Link from "next/link";
import { AnswerComposer } from "@/components/answers/answer-composer";
import { AnswerEditButton } from "@/components/dashboard/answer-edit-button";
import { DisputeClientButton } from "@/components/dashboard/dispute-button";
import styles from "./dashboard.module.css";

const QUALIFYING_THRESHOLD = 10;

export type InboxQuestion = {
  id: string;
  body: string;
  net_upvotes: number;
  week_number: number;
  created_at: string;
  is_seeded: boolean;
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
  profileVerified,
  canPublish,
  politicianSlug,
  politicianName,
  isNew,
}: {
  question: InboxQuestion;
  isAdmin: boolean;
  profileVerified: boolean;
  canPublish: boolean;
  politicianSlug: string;
  politicianName: string;
  isNew: boolean;
}) {
  const officialAnswer = question.answers.find(
    (a) => ["direct", "team_statement"].includes(a.answer_type) && !a.is_ai_generated && !a.is_draft
  );
  const aiAnswer = question.answers.find(
    (a) => a.answer_type === "ai_analysis" && a.is_ai_generated && !a.is_draft
  );
  const isQualifying = question.net_upvotes >= QUALIFYING_THRESHOLD;

  return <article className={styles.question} aria-label="Constituent question">
    <header className={styles.questionHeader}>
      <div>
        <div className={styles.badgeRow}>
          {isNew && <span className={styles.badge}>New</span>}
          {isQualifying ? <span className={styles.badge}>Qualifying question</span> : <span className={styles.meta}>Below 10 net upvotes</span>}
        </div>
        {question.is_seeded && <p className={styles.meta}>📋 Suggested Question — AI-generated from public record</p>}
        <p className={styles.questionBody}>{question.body}</p>
      </div>
      <div className={styles.questionAside}>
        <p className={styles.meta}>{question.net_upvotes} net upvote{question.net_upvotes !== 1 ? "s" : ""}</p>
        <Link href={`/${politicianSlug}#question-${question.id}`} className={styles.textButton} target="_blank" rel="noopener noreferrer">View on profile ↗<span className="sr-only"> (opens in a new tab)</span></Link>
      </div>
    </header>

    {officialAnswer && <div className={styles.answer}>
      <p className={`${styles.eyebrow} ${styles.success}`}>Official response</p>
      <p className={styles.answerBody}>{officialAnswer.body}</p>
      {canPublish && <AnswerEditButton answerId={officialAnswer.id} initialBody={officialAnswer.body} createdAt={officialAnswer.created_at} />}
    </div>}
    {aiAnswer && <div className={styles.analysis}>
      <p className={styles.eyebrow}>🤖 AI Analysis of Public Record</p>
      <p className={styles.analysisBody}>{aiAnswer.body}</p>
      <DisputeClientButton answerId={aiAnswer.id} />
    </div>}
    {!officialAnswer && <div className={styles.composer}>
      <AnswerComposer questionId={question.id} questionBody={question.body} politicianSlug={politicianSlug} politicianName={politicianName} isAdmin={isAdmin} profileVerified={profileVerified} canPublish={canPublish} />
    </div>}
  </article>;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "qualifying", label: "Qualifying" },
  { key: "unanswered", label: "Unanswered" },
  { key: "answered", label: "Answered" },
];

export function DashboardQuestionInbox({
  questions,
  totalQuestions,
  role,
  profileVerified,
  politicianSlug,
  politicianName,
  cutoff48h,
}: {
  questions: InboxQuestion[];
  totalQuestions: number;
  role: string;
  profileVerified: boolean;
  politicianSlug: string;
  politicianName: string;
  cutoff48h: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const isAdmin = role === "admin";
  const canPublish = profileVerified && ["admin", "editor"].includes(role);

  const qualifying = questions.filter((q) => q.net_upvotes >= QUALIFYING_THRESHOLD);
  const unansweredQualifying = qualifying.filter((q) => !hasOfficialAnswer(q));

  const filtered = questions.filter((q) => {
    if (filter === "qualifying") return q.net_upvotes >= QUALIFYING_THRESHOLD;
    if (filter === "unanswered") return !hasOfficialAnswer(q);
    if (filter === "answered") return hasOfficialAnswer(q);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.net_upvotes - a.net_upvotes);

  const isLimited = totalQuestions > questions.length;

  return <div>
    <div className={styles.inboxHeader}>
      <h3 className={styles.sectionTitle}>This week’s questions</h3>
      <p className={styles.meta}>{isLimited ? `Showing the top ${questions.length} of ${totalQuestions} active questions by net upvotes.` : `${questions.length} active question${questions.length !== 1 ? "s" : ""} this week.`}</p>
      <p className={styles.meta}>{qualifying.length} {isLimited ? "shown " : ""}question{qualifying.length !== 1 ? "s have" : " has"} at least 10 net upvotes. {unansweredQualifying.length} of those have no published official response.</p>
      <p className={styles.meta}>Questions with 10+ net upvotes count toward the public response rate. AI analysis and unpublished drafts do not count as official responses.</p>
      {isLimited && <p className={styles.meta}>Filters apply to these {questions.length} loaded questions.</p>}
    </div>
    <div className={styles.filters} role="group" aria-label="Filter loaded questions">
      {FILTERS.map(({ key, label }) => {
        const count = key === "all" ? questions.length : key === "qualifying" ? qualifying.length : key === "unanswered" ? questions.filter(q => !hasOfficialAnswer(q)).length : questions.filter(q => hasOfficialAnswer(q)).length;
        return <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={styles.filter}>{label} <span>{count}</span></button>;
      })}
    </div>
    <p className="sr-only" role="status">{sorted.length} {filter} question{sorted.length !== 1 ? "s" : ""} shown.</p>
    {sorted.length === 0 ? <div className={styles.empty}>
      <p>{filter === "qualifying" ? "No questions in this view have reached 10 net upvotes yet." : filter === "unanswered" ? "Every question in this view has an official response." : filter === "answered" ? "No official responses in this view yet." : "No questions this week yet."}</p>
    </div> : <div>{sorted.map(question => <QuestionCard key={question.id} question={question} isAdmin={isAdmin} profileVerified={profileVerified} canPublish={canPublish} politicianSlug={politicianSlug} politicianName={politicianName} isNew={question.created_at > cutoff48h} />)}</div>}
  </div>;
}
