import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateResponseRate,
  getVoteEligibilityError,
  isPublishedOfficialAnswer,
  isValidIsoWeek,
  profilePeriodCutoff,
  readProfileCount,
  resolveProfileView,
  safeJsonLd,
  safeWebUrl,
  sanitizeSources,
  toPublicAnswers,
  type RawProfileAnswer,
} from "./helpers";

test("archives accept real ISO weeks and reject partial, invalid and future weeks", () => {
  assert.equal(isValidIsoWeek(202053), true);
  assert.equal(isValidIsoWeek(202153), false);
  assert.equal(isValidIsoWeek(202653), true);
  for (const invalid of [202600, 202654, 202643.5, 0, NaN]) assert.equal(isValidIsoWeek(invalid), false);
  assert.equal(resolveProfileView(202644, "202643").viewingWeekNumber, 202643);
  assert.equal(resolveProfileView(202644, "202643").isHistoricalView, true);
  for (const invalid of ["202643tail", "202600", "202153", "202645", "202644", "-202643", "999999999999999999"]) {
    const view = resolveProfileView(202644, invalid);
    assert.equal(view.viewingWeekNumber, 202644);
    assert.equal(view.isHistoricalView, false);
  }
  assert.equal(resolveProfileView(202644, "202643", "month").period, "month");
  assert.equal(resolveProfileView(202644, "202643", "month").isHistoricalView, false);
  assert.equal(resolveProfileView(202644, undefined, "invalid").period, "week");
  assert.throws(() => resolveProfileView(202153));
});

test("rolling scopes are exactly 28 days and 365 days, with no date cutoff for week/all", () => {
  const now = Date.parse("2026-10-30T12:00:00.000Z");
  assert.equal(profilePeriodCutoff("month", now), "2026-10-02T12:00:00.000Z");
  assert.equal(profilePeriodCutoff("year", now), "2025-10-30T12:00:00.000Z");
  assert.equal(profilePeriodCutoff("week", now), null);
  assert.equal(profilePeriodCutoff("all", now), null);
});

test("response rates use exact qualifying totals independently of visible list limits", () => {
  assert.equal(calculateResponseRate(0, 0), null);
  assert.equal(calculateResponseRate(0, 12), 0);
  assert.equal(calculateResponseRate(5, 10), 50);
  assert.equal(calculateResponseRate(1500, 3000), 50);
  for (const counts of [[2, 1], [-1, 10], [1, -10], [1.5, 10], [NaN, 10]]) {
    assert.throws(() => calculateResponseRate(counts[0]!, counts[1]!));
  }
});

test("only published direct and team responses count as official", () => {
  assert.equal(isPublishedOfficialAnswer({ answer_type: "direct", is_ai_generated: false, is_draft: false }), true);
  assert.equal(isPublishedOfficialAnswer({ answer_type: "team_statement", is_ai_generated: false, is_draft: false }), true);
  assert.equal(isPublishedOfficialAnswer({ answer_type: "direct", is_ai_generated: false, is_draft: true }), false);
  assert.equal(isPublishedOfficialAnswer({ answer_type: "direct", is_ai_generated: true, is_draft: false }), false);
  assert.equal(isPublishedOfficialAnswer({ answer_type: "ai_analysis", is_ai_generated: false, is_draft: false }), false);
});

test("public answer mapping drops draft bodies, private fields and unsafe media", () => {
  const answer: RawProfileAnswer & { published_by: string } = {
    id: "answer-1", answer_type: "direct", body: "Published text", is_ai_generated: false,
    is_draft: false, ai_confidence: null, sources: [], is_disputed: false,
    created_at: "2026-10-30T12:00:00.000Z", published_by: "private-user-id",
    answer_media: [
      { id: "image", media_type: "image", public_url: "https://example.com/image.jpg", file_name: "image.jpg" },
      { id: "unsafe", media_type: "image", public_url: "javascript:alert(1)", file_name: null },
      { id: "unknown", media_type: "document", public_url: "https://example.com/document", file_name: null },
    ],
  };
  const publicAnswers = toPublicAnswers([answer, { ...answer, id: "draft", is_draft: true, body: "PRIVATE_DRAFT_SENTINEL" }]);
  assert.equal(publicAnswers.length, 1);
  const serialized = JSON.stringify(publicAnswers);
  assert.equal(serialized.includes("PRIVATE_DRAFT_SENTINEL"), false);
  assert.equal(serialized.includes("private-user-id"), false);
  assert.equal(serialized.includes("published_by"), false);
  assert.equal(serialized.includes("is_draft"), false);
  assert.equal(publicAnswers[0]?.answer_media.length, 1);
  assert.equal(publicAnswers[0]?.answer_media[0]?.media_type, "image");
});

test("public AI analysis stays distinct and its sources retain safe citations", () => {
  const sources = sanitizeSources([
    "https://example.com/statement",
    { url: "https://example.com/report", title: "Report", date: "2026-10-30", internal_note: "private" },
    { url: "javascript:alert(1)", title: "Unsafe link is removed" },
    "data:text/html,unsafe", null,
  ]);
  assert.deepEqual(sources, [
    { url: "https://example.com/statement" },
    { url: "https://example.com/report", title: "Report", date: "2026-10-30" },
    { title: "Unsafe link is removed" },
  ]);
});

test("web URLs and embedded JSON-LD cannot introduce active script URLs or closing script tags", () => {
  assert.equal(safeWebUrl("https://example.com/path?q=1"), "https://example.com/path?q=1");
  assert.equal(safeWebUrl("http://example.com"), "http://example.com/");
  for (const value of ["javascript:alert(1)", "data:text/html,<script>", "https://user:password@example.com", "//example.com", "https://example.com\n/path", null]) {
    assert.equal(safeWebUrl(value), null);
  }
  const value = { name: '</script><script>alert("test")</script>\u2028&' };
  const encoded = safeJsonLd(value);
  assert.equal(encoded.includes("<"), false);
  assert.equal(encoded.includes("&"), false);
  assert.deepEqual(JSON.parse(encoded), value);
});

test("invalid or missing aggregate responses fail rather than becoming a zero rate", () => {
  assert.equal(readProfileCount([{ count: 3000 }]), 3000);
  assert.equal(readProfileCount([{ count: 0 }]), 0);
  for (const value of [null, [], [{ count: null }], [{ count: "0" }], [{ count: -1 }], [{ count: 1 }, { count: 2 }]]) {
    assert.throws(() => readProfileCount(value));
  }
});

test("vote writes and removals require an active question in the actual current week", () => {
  assert.equal(getVoteEligibilityError({ status: "active", week_number: 202644 }, 202644, 202644), null);
  assert.equal(getVoteEligibilityError(null, 202644, 202644)?.status, 404);
  assert.equal(getVoteEligibilityError({ status: "removed", week_number: 202644 }, 202644, 202644)?.status, 422);
  assert.equal(getVoteEligibilityError({ status: "merged", week_number: 202644 }, 202644, 202644)?.status, 422);
  assert.equal(getVoteEligibilityError({ status: "active", week_number: 202643 }, 202643, 202644)?.status, 409);
  assert.equal(getVoteEligibilityError({ status: "active", week_number: 202643 }, 202644, 202644)?.status, 409);
  assert.equal(getVoteEligibilityError({ status: "active", week_number: 202644 }, 202643, 202644)?.status, 409);
});
