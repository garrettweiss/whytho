/** Legacy read-then-send scripts cannot establish consent or exactly-once delivery. */
export function requireOutreachPreview(args: readonly string[]): true {
  if (args.some(arg => /^(?:--send|--apply|--live)(?:=|$)/.test(arg))) {
    throw new Error("Live outreach is paused. Use the reviewed opt-in outbox in docs/launch/POLITICIAN_NOTIFICATIONS_PLAN.md; this legacy script is preview-only.");
  }
  return true;
}

/** Defense in depth: no call path in a legacy script may contact a recipient. */
export function blockLegacyOutreachDelivery(): never {
  throw new Error("Legacy automated outreach is disabled. Recipient consent, Garrett's message approval, durable deduplication and suppression are required before delivery.");
}
