import assert from "node:assert/strict";
import test from "node:test";
import { parseSavedAnswerResult } from "./answer-result";

const answerId = "12345678-1234-1234-1234-123456789abc";

test("reads the API's top-level answer ID and explicit publication state", () => {
  assert.deepEqual(parseSavedAnswerResult({ success: true, answer_id: answerId, is_draft: false }), { answerId, isDraft: false });
  assert.deepEqual(parseSavedAnswerResult({ success: true, answer_id: answerId, is_draft: true }), { answerId, isDraft: true });
});

test("unknown or malformed success cannot imply a published answer", () => {
  for (const response of [null, {}, { success: true, answer: { id: answerId } },
    { success: true, answer_id: answerId }, { success: true, answer_id: answerId, is_draft: "false" },
    { success: false, answer_id: answerId, is_draft: false }, { success: true, answer_id: "not-an-id", is_draft: false }]) {
    assert.throws(() => parseSavedAnswerResult(response), /could not confirm its status/);
  }
});
