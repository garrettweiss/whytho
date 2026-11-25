import test from "node:test";
import assert from "node:assert/strict";
import { QUESTION_NOTICE_VERSION, validQuestionNoticeInput } from "./consent";
const politician_id = "10000000-0000-4000-8000-000000000001";
test("daily consent requires current wording and a real timezone", () => {
  assert.equal(validQuestionNoticeInput({ politician_id, mode: "daily", timezone: "America/New_York", consent_version: QUESTION_NOTICE_VERSION }), true);
  assert.equal(validQuestionNoticeInput({ politician_id, mode: "daily", timezone: "America/New_York" }), false);
  assert.equal(validQuestionNoticeInput({ politician_id, mode: "daily", timezone: "not-a-zone", consent_version: QUESTION_NOTICE_VERSION }), false);
});
test("turning emails off needs no renewed consent or timezone", () => {
  assert.equal(validQuestionNoticeInput({ politician_id, mode: "off" }), true);
});
test("only the daily pilot and off modes are accepted", () => {
  assert.equal(validQuestionNoticeInput({ politician_id, mode: "prompt", timezone: "UTC", consent_version: QUESTION_NOTICE_VERSION }), false);
});
