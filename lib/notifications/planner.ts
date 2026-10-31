/** Pure, side-effect-free contract for the proposed politician notification worker. */
export type QuestionEvent = {
  id: string;
  politicianId: string;
  createdAt: string;
  source: "user" | "seeded" | "x";
  isSeeded: boolean;
  status: "active" | "hidden" | "archived";
  hasPublishedOfficialAnswer: boolean;
};
export type Recipient = {
  userId: string;
  politicianId: string;
  activeMember: boolean;
  verificationTier: "0" | "1" | "2" | "3";
  emailVerified: boolean;
  consentedAt: string | null;
  consentVersion: string | null;
  mode: "off" | "daily" | "prompt";
  suppressed: boolean;
};
export type Plan =
  | { action: "skip"; reason: string }
  | { action: "queue"; earliestAt: string; eventKey: string; recipientKey: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The worker must re-read this eligibility immediately before a provider call. */
export function planQuestionNotification(event: QuestionEvent, recipient: Recipient, options: {
  now: string;
  lastSentAt: string | null;
  alreadyDelivered: boolean;
  nextDailyWindow: string;
}): Plan {
  const now = Date.parse(options.now);
  const created = Date.parse(event.createdAt);
  if (![event.id,event.politicianId,recipient.userId,recipient.politicianId].every(value => uuid.test(value)) || !Number.isFinite(now) || !Number.isFinite(created) || created > now) return { action: "skip", reason: "invalid_event" };
  if (event.source !== "user" || event.isSeeded) return { action: "skip", reason: "not_user_question" };
  if (event.status !== "active") return { action: "skip", reason: "not_public" };
  if (event.hasPublishedOfficialAnswer) return { action: "skip", reason: "already_answered" };
  if (!recipient.activeMember || event.politicianId !== recipient.politicianId) return { action: "skip", reason: "not_current_team" };
  if (!["2","3"].includes(recipient.verificationTier)) return { action: "skip", reason: "unverified_profile" };
  if (!recipient.emailVerified) return { action: "skip", reason: "unverified_email" };
  if (recipient.suppressed || recipient.mode === "off") return { action: "skip", reason: "suppressed" };
  const consent = recipient.consentedAt ? Date.parse(recipient.consentedAt) : NaN;
  if (!Number.isFinite(consent) || consent > now || recipient.consentVersion !== "politician-question-notices-v1") return { action: "skip", reason: "no_current_consent" };
  if (options.alreadyDelivered) return { action: "skip", reason: "already_delivered" };
  const daily = Date.parse(options.nextDailyWindow);
  const previous = options.lastSentAt ? Date.parse(options.lastSentAt) : null;
  if (!Number.isFinite(daily) || daily < now || (previous !== null && (!Number.isFinite(previous) || previous > now))) return { action: "skip", reason: "invalid_schedule" };
  // First prompt notice waits 15 minutes. Subsequent activity is batched, not repeated.
  const earliest = Math.max(now,created + 15 * MINUTE,previous === null ? now : previous + DAY);
  const due = recipient.mode === "daily" ? Math.max(earliest,daily) : earliest;
  return { action: "queue", earliestAt: new Date(due).toISOString(), eventKey: `question-created:${event.id}`, recipientKey: `question-created:${event.id}:email:${recipient.userId}:v1` };
}

export function deliveryRecovery(attempt: { outcome: "not_started" | "rejected" | "accepted" | "ambiguous"; firstAttemptAt: string | null; now: string }): "send" | "retry_same_key" | "done" | "reconcile" {
  if (attempt.outcome === "accepted") return "done";
  if (attempt.outcome === "not_started") return "send";
  if (!attempt.firstAttemptAt) return "reconcile";
  const elapsed = Date.parse(attempt.now) - Date.parse(attempt.firstAttemptAt);
  // Resend retains idempotency keys for 24 hours. Stop before that boundary.
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 23 * 60 * MINUTE ? "retry_same_key" : "reconcile";
}
