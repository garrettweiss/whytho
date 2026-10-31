import { isPublishedOfficialAnswer, isValidIsoWeek, safeWebUrl } from "../profile/helpers";
import type { LeaderboardEntry, OfficialAnswerReference, RankingQuestion } from "./types";

export const LEADERBOARD_QUERY_PAGE_SIZE = 500;
export const LEADERBOARD_DISPLAY_PAGE_SIZE = 50;

/** Stable keyset pages continue to the actual end, including populations over 1,000. */
export async function collectCompletePages<T extends { id: string }>(
  readPage: (after: string | null) => Promise<T[]>,
  pageSize = LEADERBOARD_QUERY_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error("Invalid leaderboard page size");
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await readPage(after);
    if (page.length > pageSize) throw new Error("Leaderboard page exceeded its bound");
    let previous: string | null = after;
    for (const row of page) {
      if (!row.id || (previous !== null && row.id <= previous)) throw new Error("Leaderboard pagination did not advance");
      previous = row.id;
    }
    rows.push(...page);
    if (page.length < pageSize) return rows;
    after = previous;
  }
}

export function rankOfficialResponses(
  questions: readonly RankingQuestion[],
  answers: readonly OfficialAnswerReference[],
  weekNumber: number,
): LeaderboardEntry[] {
  if (!isValidIsoWeek(weekNumber)) throw new Error("Invalid leaderboard week");
  const eligibleQuestions = new Map<string, RankingQuestion>();
  for (const question of questions) {
    const politician = question.politicians;
    if (question.week_number !== weekNumber || question.status !== "active" || question.net_upvotes < 10 ||
      !politician?.is_active || politician.is_test) continue;
    if (!Number.isSafeInteger(question.net_upvotes) || politician.id !== question.politician_id) {
      throw new Error("Inconsistent qualifying question");
    }
    const existing = eligibleQuestions.get(question.id);
    if (existing && existing.politician_id !== question.politician_id) throw new Error("Conflicting question ownership");
    eligibleQuestions.set(question.id, question);
  }

  const answeredQuestions = new Set<string>();
  for (const answer of answers) {
    const question = eligibleQuestions.get(answer.question_id);
    if (question && answer.politician_id === question.politician_id && isPublishedOfficialAnswer(answer)) {
      answeredQuestions.add(question.id);
    }
  }

  const politicians = new Map<string, LeaderboardEntry>();
  for (const question of eligibleQuestions.values()) {
    const politician = question.politicians!;
    let entry = politicians.get(politician.id);
    if (!entry) {
      entry = {
        id: politician.id,
        slug: politician.slug,
        full_name: politician.full_name,
        office: politician.office,
        state: politician.state,
        party: politician.party,
        photo_url: safeWebUrl(politician.photo_url),
        is_candidate: politician.is_candidate,
        politician_type: politician.politician_type,
        qualifyingQuestions: 0,
        answeredQualifying: 0,
        responseRate: 0,
        rank: 0,
      };
      politicians.set(politician.id, entry);
    }
    entry.qualifyingQuestions += 1;
    if (answeredQuestions.has(question.id)) entry.answeredQualifying += 1;
  }

  const entries = [...politicians.values()].sort((first, second) => {
    const rateDifference = second.answeredQualifying * first.qualifyingQuestions - first.answeredQualifying * second.qualifyingQuestions;
    return rateDifference || second.qualifyingQuestions - first.qualifyingQuestions ||
      first.full_name.localeCompare(second.full_name, "en") || first.id.localeCompare(second.id);
  });
  entries.forEach((entry, index) => {
    entry.responseRate = entry.answeredQualifying / entry.qualifyingQuestions * 100;
    const previous = entries[index - 1];
    const tied = previous && previous.answeredQualifying * entry.qualifyingQuestions === entry.answeredQualifying * previous.qualifyingQuestions;
    entry.rank = tied ? previous.rank : index + 1;
  });
  return entries;
}

export function leaderboardDisplayPage(value: string | undefined, population: number): number {
  const last = Math.max(1, Math.ceil(population / LEADERBOARD_DISPLAY_PAGE_SIZE));
  const requested = value && /^\d{1,6}$/.test(value) ? Number(value) : 1;
  return Math.min(last, Math.max(1, requested));
}
