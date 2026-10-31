import type { ProfileAnswer, ProfileAnswerMedia, ProfilePeriod, ProfileSource, ProfileView } from "./types";
import { safeAnswerMediaUrl } from "@/components/answers/media-url";

export function safeWebUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function safeJsonLd(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** ISO years have 53 weeks only when Jan 1 is Thursday, or Wednesday in a leap year. */
export function isValidIsoWeek(value: number): boolean {
  if (!Number.isInteger(value)) return false;
  const year = Math.floor(value / 100);
  const week = value % 100;
  if (year < 2000 || year > 2099 || week < 1 || week > 53) return false;
  if (week < 53) return true;
  const day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day === 4 || (day === 3 && leap);
}

export function resolveProfileView(currentWeekNumber: number, weekParam?: string, periodParam?: string): ProfileView {
  if (!isValidIsoWeek(currentWeekNumber)) throw new Error("Profile reporting period unavailable");
  const validPeriods: ProfilePeriod[] = ["week", "month", "year", "all"];
  const parsedWeek = weekParam && /^\d{6}$/.test(weekParam) ? Number(weekParam) : null;
  const period: ProfilePeriod = validPeriods.includes(periodParam as ProfilePeriod) ? periodParam as ProfilePeriod : "week";
  const isHistoricalView = !periodParam && parsedWeek !== null && isValidIsoWeek(parsedWeek) && parsedWeek < currentWeekNumber;
  return { currentWeekNumber, isHistoricalView, viewingWeekNumber: isHistoricalView ? parsedWeek : currentWeekNumber, period: isHistoricalView ? "week" : period };
}

export function profilePeriodCutoff(period: ProfilePeriod, now = Date.now()): string | null {
  const days = period === "month" ? 28 : period === "year" ? 365 : null;
  return days === null ? null : new Date(now - days * 86_400_000).toISOString();
}

export function readProfileCount(value: unknown): number {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("Profile count unavailable");
  const row: unknown = value[0];
  if (!row || typeof row !== "object" || !("count" in row) || typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0) {
    throw new Error("Profile count unavailable");
  }
  return row.count;
}

export function calculateResponseRate(answeredQualifying: number, qualifyingQuestions: number): number | null {
  if (![answeredQualifying, qualifyingQuestions].every((count) => Number.isSafeInteger(count) && count >= 0) || answeredQualifying > qualifyingQuestions) {
    throw new Error("Inconsistent profile counts");
  }
  return qualifyingQuestions === 0 ? null : answeredQualifying / qualifyingQuestions * 100;
}

export function isPublishedOfficialAnswer(answer: { answer_type: string; is_ai_generated: boolean; is_draft: boolean }): boolean {
  return ["direct", "team_statement"].includes(answer.answer_type) && answer.is_ai_generated === false && answer.is_draft === false;
}

export function getVoteEligibilityError(
  question: { status: string; week_number: number } | null,
  requestedWeek: number,
  currentWeek: number,
): { status: 404 | 409 | 422; error: string } | null {
  if (!question) return { status: 404, error: "Question not found." };
  if (question.status !== "active") return { status: 422, error: "This question is no longer active." };
  if (question.week_number !== currentWeek) {
    return { status: 409, error: "Voting is closed for this question. Only current-week questions accept votes." };
  }
  if (requestedWeek !== question.week_number) {
    return { status: 409, error: "The question week does not match. Refresh and try again." };
  }
  return null;
}

export function sanitizeSources(value: unknown): ProfileSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((source: unknown): ProfileSource[] => {
    if (typeof source === "string") {
      const url = safeWebUrl(source);
      return url ? [{ url }] : [];
    }
    if (!source || typeof source !== "object") return [];
    const record = source as Record<string, unknown>;
    const url = safeWebUrl(record.url);
    const title = typeof record.title === "string" ? record.title : undefined;
    const date = typeof record.date === "string" ? record.date : undefined;
    if (!url && !title) return [];
    return [{ ...(url ? { url } : {}), ...(title ? { title } : {}), ...(date ? { date } : {}) }];
  });
}

export type RawProfileAnswer = Omit<ProfileAnswer, "sources" | "answer_media"> & {
  is_draft: boolean;
  sources: unknown;
  answer_media: Array<Omit<ProfileAnswerMedia, "media_type"> & { media_type: string }>;
};

/** Reconstruct only public fields, even if an upstream row unexpectedly has extra fields. */
export function toPublicAnswers(answers: readonly RawProfileAnswer[]): ProfileAnswer[] {
  return answers.filter((answer) => answer.is_draft === false).map((answer) => ({
    id: answer.id,
    answer_type: answer.answer_type,
    body: answer.body,
    is_ai_generated: answer.is_ai_generated,
    ai_confidence: answer.ai_confidence,
    sources: sanitizeSources(answer.sources),
    is_disputed: answer.is_disputed,
    created_at: answer.created_at,
    answer_media: answer.answer_media.flatMap((media): ProfileAnswerMedia[] => {
      const url = safeAnswerMediaUrl(media.public_url);
      if (!url || !["image", "video", "audio"].includes(media.media_type)) return [];
      return [{ id: media.id, media_type: media.media_type as ProfileAnswerMedia["media_type"], public_url: url, file_name: media.file_name }];
    }),
  }));
}
