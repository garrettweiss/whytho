type AnswerFlags = {
  answer_type: string;
  is_ai_generated: boolean;
  is_draft?: boolean;
};

export function isPublishedAnswer(answer: AnswerFlags): boolean {
  return answer.is_draft !== true;
}

export function isOfficialAnswer(answer: AnswerFlags): boolean {
  return isPublishedAnswer(answer) && !answer.is_ai_generated &&
    (answer.answer_type === "direct" || answer.answer_type === "team_statement");
}

export function isAIAnswer(answer: AnswerFlags): boolean {
  return answer.is_ai_generated || answer.answer_type.startsWith("ai_");
}

export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export type AnswerSource = { url?: string; title?: string; date?: string };

export function presentSources(value: unknown): AnswerSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AnswerSource[] => {
    if (typeof entry === "string") {
      const url = safeExternalUrl(entry);
      return url ? [{ url }] : [];
    }
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const url = safeExternalUrl(source.url) ?? undefined;
    const title = typeof source.title === "string" ? source.title : undefined;
    const date = typeof source.date === "string" ? source.date : undefined;
    return url || title ? [{ url, title, date }] : [];
  });
}

export function canVoteOnQuestion(questionWeek: number, currentWeek: number, isHistorical: boolean): boolean {
  return !isHistorical && questionWeek === currentWeek;
}

export type VoteValue = -1 | 0 | 1;
export type VoteMap = Record<string, VoteValue>;

// A hydration read may have started before an anonymous session's first vote
// finished saving. The successful local write must win over that stale read.
export function mergeHydratedVotes(
  rows: readonly { question_id: string; value: number | null }[],
  questionIds: readonly string[],
  savedVotes: Readonly<VoteMap>,
): VoteMap {
  const allowed = new Set(questionIds);
  const votes: VoteMap = {};
  for (const row of rows) {
    if (allowed.has(row.question_id) && (row.value === 1 || row.value === -1)) votes[row.question_id] = row.value;
  }
  for (const [questionId, value] of Object.entries(savedVotes)) {
    if (allowed.has(questionId)) votes[questionId] = value;
  }
  return votes;
}
