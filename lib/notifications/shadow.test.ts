import test from "node:test";
import assert from "node:assert/strict";
import { nextLocalNine, projectShadow, type ShadowCandidate, type ShadowHistory } from "./shadow";
const candidate: ShadowCandidate = { event_id: "event1", question_id: "question1", politician_id: "profile1", user_id: "member1", question_created_at: "2026-11-22T12:00:00Z", timezone: "America/New_York", eligible: true };
const history: ShadowHistory = { suppressionKnown: true, suppressed: false, deliveryHistoryKnown: true, lastAcceptedAt: null, completedEventIds: [] };
test("daily nine follows local dates, DST and non-hour offsets", () => {
  assert.equal(nextLocalNine(Date.parse("2026-03-07T15:00:00Z"), "America/New_York"), "2026-03-08T13:00:00.000Z");
  assert.equal(nextLocalNine(Date.parse("2026-10-31T14:00:00Z"), "America/New_York"), "2026-11-01T14:00:00.000Z");
  assert.equal(nextLocalNine(Date.parse("2026-11-22T00:00:00Z"), "Asia/Kathmandu"), "2026-11-22T03:15:00.000Z");
});
test("rolling24h cap is resolved to next9am, never arbitrary cap-expiry time", () => {
  const result = projectShadow([candidate], { member1: { ...history, lastAcceptedAt: "2026-11-21T15:00:00Z" } }, "2026-11-22T13:00:00Z");
  assert.equal(result.batches[0]?.dueAt, "2026-11-23T14:00:00.000Z");
  assert.equal(result.sendingEnabled, false);
});
test("multiple offices consolidate into one recipient batch", () => {
  const result = projectShadow([candidate, { ...candidate, event_id: "event2", question_id: "question2", politician_id: "profile2" }, candidate], { member1: history }, "2026-11-22T13:00:00Z");
  assert.equal(result.batches.length, 1); assert.deepEqual(result.batches[0]?.eventIds, ["event1", "event2"]);
});
test("revocation, completed events and unknown history stay held", () => {
  assert.equal(projectShadow([{ ...candidate, eligible: false }], { member1: history }, "2026-11-22T13:00:00Z").batches.length, 0);
  assert.equal(projectShadow([candidate], {}, "2026-11-22T13:00:00Z").held[0]?.reason, "incomplete_suppression_or_delivery_history");
  assert.equal(projectShadow([candidate], { member1: { ...history, completedEventIds: ["event1"] } }, "2026-11-22T13:00:00Z").held[0]?.reason, "already_completed");
});
test("debounce crossing9am waits until next day's9am", () => {
  const result = projectShadow([{ ...candidate, question_created_at: "2026-11-22T13:55:00Z" }], { member1: history }, "2026-11-22T13:56:00Z");
  assert.equal(result.batches[0]?.dueAt, "2026-11-23T14:00:00.000Z");
});
test("global suppression and conflicting office timezones cannot produce a batch", () => {
  assert.equal(projectShadow([candidate], { member1: { ...history, suppressed: true } }, "2026-11-22T13:00:00Z").batches.length, 0);
  const result = projectShadow([candidate, { ...candidate, event_id: "event2", timezone: "America/Chicago" }], { member1: history }, "2026-11-22T13:00:00Z");
  assert.equal(result.batches.length, 0); assert.equal(result.held.length, 2);
});
