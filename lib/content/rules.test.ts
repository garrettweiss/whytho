import test from "node:test";
import assert from "node:assert/strict";
import { measure, validateItem, validateText } from "./rules";
import type { QueueItem } from "./types";

const base: QueueItem = { id: "2026-W48-01", asset: "A1", channel: "x", scheduled_at: "2026-11-27T16:00:00.000Z", text: "", links: [], status: "draft", requires: [] };

test("X counts every link as 23 characters", () => {
  assert.equal(measure("x", "Ask here: https://whytho.us/?utm_source=x&utm_campaign=2026w48-a1"), "Ask here: ".length + 23);
  assert.equal(measure("threads", "abc"), 3);
});

test("editorial rules reject em dashes, mentions, banned phrases and foreign links", () => {
  assert.deepEqual(validateText("x", "Ask one question: https://whytho.us/"), []);
  assert.ok(validateText("x", "Silence — is an answer").some((p) => p.includes("em dash")));
  assert.ok(validateText("x", "Hey @repgabeevans answer this").some((p) => p.includes("@mention")));
  assert.ok(validateText("x", "They ignored the question").some((p) => p.includes("ignored")));
  assert.ok(validateText("x", "Read more: https://example.com/").some((p) => p.includes("not an https whytho.us")));
  assert.ok(validateText("x", "Read more: http://whytho.us/").some((p) => p.includes("not an https whytho.us")));
});

test("platform limits apply per channel", () => {
  const long = "a".repeat(290);
  assert.ok(validateText("x", long).some((p) => p.includes("exceeds")));
  assert.deepEqual(validateText("bluesky", long), []);
  assert.ok(validateText("bluesky", "a".repeat(301)).some((p) => p.includes("exceeds")));
  assert.deepEqual(validateText("threads", "a".repeat(500)), []);
});

test("status posts need an as-of stamp and declared links must appear", () => {
  assert.ok(validateItem({ ...base, asset: "WEEK_NOTE", text: "No response recorded. https://whytho.us/" }).some((p) => p.includes("as of")));
  assert.deepEqual(validateItem({ ...base, asset: "WEEK_NOTE", text: "No official response is recorded as of {as_of}. https://whytho.us/", links: ["https://whytho.us/"] }), []);
  assert.ok(validateItem({ ...base, text: "Hello", links: ["https://whytho.us/verify"] }).some((p) => p.includes("missing from the text")));
});
