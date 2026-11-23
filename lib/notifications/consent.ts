export const QUESTION_NOTICE_VERSION = "politician-question-notices-v1";
export const QUESTION_NOTICE_TEXT = "Email me a daily summary of new questions for this office at 9 a.m. in my selected timezone, at most once per 24 hours. I can turn these emails off at any time.";

export function validQuestionNoticeInput(value: unknown): value is { politician_id: string; mode: "off" | "daily"; timezone: string; consent_version?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.politician_id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.politician_id)) return false;
  if (body.mode === "off") return true;
  if (body.mode !== "daily" || body.consent_version !== QUESTION_NOTICE_VERSION || typeof body.timezone !== "string" || body.timezone.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: body.timezone }); return true; } catch { return false; }
}
