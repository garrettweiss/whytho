/** No-send projection. No provider imports, recipients' emails or persistence effects. */
export type ShadowCandidate = {
  event_id: string; question_id: string; politician_id: string; user_id: string;
  question_created_at: string; timezone: string; eligible: boolean;
};
export type ShadowHistory = {
  suppressionKnown: boolean; suppressed: boolean; deliveryHistoryKnown: boolean;
  lastAcceptedAt: string | null; completedEventIds: string[];
};
const DAY = 86_400_000;
function civilParts(time: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(time));
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}
/** First local 9 a.m. at/after the lower bound, including DST and half-hour zones. */
export function nextLocalNine(lowerBound: number, timezone: string): string {
  if (!Number.isFinite(lowerBound)) throw new Error("Invalid schedule clock");
  const local = civilParts(lowerBound, timezone);
  for (let day = 0; day < 3; day++) {
    const civil = new Date(Date.UTC(local.year, local.month - 1, local.day + day, 9));
    const wanted = civil.getTime();
    let candidate = wanted;
    for (let step = 0; step < 4; step++) {
      const current = civilParts(candidate, timezone);
      candidate += wanted - Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
    }
    const check = civilParts(candidate, timezone);
    if (check.year !== civil.getUTCFullYear() || check.month !== civil.getUTCMonth() + 1 || check.day !== civil.getUTCDate() || check.hour !== 9 || check.minute !== 0 || check.second !== 0) throw new Error("Unresolved local schedule");
    if (candidate >= lowerBound) return new Date(candidate).toISOString();
  }
  throw new Error("Unresolved daily window");
}

export function projectShadow(candidates: ShadowCandidate[], history: Record<string, ShadowHistory>, nowIso: string) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("Invalid shadow clock");
  const held: { eventId: string; userId: string; reason: string }[] = [];
  const groups = new Map<string, ShadowCandidate[]>();
  const seen = new Set<string>();
  for (const row of candidates) {
    const key = `${row.event_id}:${row.user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const h = history[row.user_id];
    const created = Date.parse(row.question_created_at);
    const reason = !row.eligible ? "currently_ineligible" : !Number.isFinite(created) || created > now ? "invalid_event_time" : !h?.suppressionKnown || !h.deliveryHistoryKnown ? "incomplete_suppression_or_delivery_history" : h.suppressed ? "suppressed" : h.completedEventIds.includes(row.event_id) ? "already_completed" : null;
    if (reason) { held.push({ eventId: row.event_id, userId: row.user_id, reason }); continue; }
    const group = groups.get(row.user_id) ?? []; group.push(row); groups.set(row.user_id, group);
  }
  const batches: { userId: string; timezone: string; dueAt: string; eventIds: string[]; questionIds: string[] }[] = [];
  for (const [userId, rows] of groups) {
    const zones = new Set(rows.map(row => row.timezone));
    const h = history[userId];
    try {
      if (!h || !rows[0]) throw new Error("incomplete_suppression_or_delivery_history");
      const last = h.lastAcceptedAt === null ? null : Date.parse(h.lastAcceptedAt);
      if (zones.size !== 1) throw new Error("conflicting_recipient_timezones");
      if (last !== null && (!Number.isFinite(last) || last > now)) throw new Error("invalid_delivery_history");
      const lower = Math.max(now, ...rows.map(row => Date.parse(row.question_created_at) + 15 * 60_000), last === null ? now : last + DAY);
      const timezone = rows[0].timezone;
      batches.push({ userId, timezone, dueAt: nextLocalNine(lower, timezone), eventIds: rows.map(row => row.event_id).sort(), questionIds: rows.map(row => row.question_id).sort() });
    } catch (error) {
      for (const row of rows) held.push({ eventId: row.event_id, userId, reason: error instanceof Error ? error.message : "invalid_schedule" });
    }
  }
  return { sendingEnabled: false as const, batches, held };
}
