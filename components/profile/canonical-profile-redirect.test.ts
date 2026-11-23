import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProfileDestination } from "./canonical-profile-redirect";

test("old profile links preserve period, sorting, and original question anchors", () => {
  assert.equal(canonicalProfileDestination("https://whytho.us/old?period=all&sort=newest#question-123", "original"),
    "https://whytho.us/original?period=all&sort=newest#question-123");
  assert.equal(canonicalProfileDestination("https://whytho.us/original#answer-123", "original"), "https://whytho.us/original#answer-123");
  for (const slug of ["//other.test", "bad?url", "bad#hash", "bad/name", ""]) assert.throws(() => canonicalProfileDestination("https://whytho.us/old", slug));
});
