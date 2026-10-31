import assert from "node:assert/strict";
import test from "node:test";
import { canVoteOnQuestion, isAIAnswer, isOfficialAnswer, isPublishedAnswer, mergeHydratedVotes, presentSources, safeExternalUrl } from "./answer-presentation";

test("only published human direct or team responses receive the official label", () => {
  const direct = { answer_type: "direct", is_ai_generated: false, is_draft: false };
  assert.equal(isOfficialAnswer(direct), true);
  assert.equal(isOfficialAnswer({ ...direct, answer_type: "team_statement" }), true);
  assert.equal(isOfficialAnswer({ ...direct, is_draft: true }), false);
  assert.equal(isOfficialAnswer({ ...direct, is_ai_generated: true }), false);
  assert.equal(isOfficialAnswer({ ...direct, answer_type: "ai_analysis" }), false);
  assert.equal(isOfficialAnswer({ ...direct, answer_type: "unrecognized" }), false);
});

test("AI type is authoritative even when the legacy generation flag is false", () => {
  assert.equal(isAIAnswer({ answer_type: "ai_analysis", is_ai_generated: false }), true);
  assert.equal(isAIAnswer({ answer_type: "direct", is_ai_generated: true }), true);
  assert.equal(isAIAnswer({ answer_type: "direct", is_ai_generated: false }), false);
});

test("drafts are hidden while already-filtered public answer shapes remain compatible", () => {
  assert.equal(isPublishedAnswer({ answer_type: "direct", is_ai_generated: false, is_draft: true }), false);
  assert.equal(isPublishedAnswer({ answer_type: "direct", is_ai_generated: false }), true);
});

test("sources allow only absolute HTTP links and handle mixed legacy source shapes", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("data:text/html,test"), null);
  assert.equal(safeExternalUrl("//untrusted.test"), null);
  assert.equal(safeExternalUrl("https://example.gov/statement"), "https://example.gov/statement");
  assert.deepEqual(presentSources([
    null,
    "https://example.gov/statement",
    { url: "javascript:alert(1)", title: "Unlinked source title", date: "2026-10-30" },
    { url: "data:text/html,unsafe" },
    { title: { unexpected: true } },
  ]), [
    { url: "https://example.gov/statement" },
    { url: undefined, title: "Unlinked source title", date: "2026-10-30" },
  ]);
});

test("aggregate periods never reopen voting on previous weeks", () => {
  assert.equal(canVoteOnQuestion(202644, 202644, false), true);
  assert.equal(canVoteOnQuestion(202643, 202644, false), false);
  assert.equal(canVoteOnQuestion(202644, 202644, true), false);
});

test("a successful vote wins over a hydration read that started before it saved", () => {
  assert.deepEqual(mergeHydratedVotes([], ["question-a"], { "question-a": 1 }), { "question-a": 1 });
  assert.deepEqual(mergeHydratedVotes([{ question_id: "question-a", value: 1 }], ["question-a"], { "question-a": -1 }), { "question-a": -1 });
  assert.deepEqual(mergeHydratedVotes([{ question_id: "question-a", value: -1 }], ["question-a"], { "question-a": 0 }), { "question-a": 0 });
});

test("vote hydration rejects unexpected values and unrelated question IDs", () => {
  assert.deepEqual(mergeHydratedVotes([
    { question_id: "question-a", value: -1 },
    { question_id: "question-b", value: 8 },
    { question_id: "unrelated", value: 1 },
  ], ["question-a", "question-b"], { unrelated: 1 }), { "question-a": -1 });
});
