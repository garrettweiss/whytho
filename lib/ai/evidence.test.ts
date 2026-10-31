import assert from "node:assert/strict";
import test from "node:test";
import { validEvidence } from "./evidence";
const valid = { title: "Recorded vote", url: "https://example.gov/vote", date: "2026-10-01", excerpt: "The official record contains the verified vote and the bill title.", reviewedBy: "Reviewer" };
test("evidence requires reviewed excerpts and an authentic date", () => {
  assert.ok(validEvidence(valid));
  for (const change of [{ reviewedBy: "" }, { date: "2026-02-31" }, { date: "2099-01-01" }, { excerpt: "" }, { url: "javascript:alert(1)" }]) assert.equal(validEvidence({ ...valid,...change }),false);
  assert.equal(validEvidence(null),false);
});
