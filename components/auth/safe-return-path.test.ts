import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnPath } from "./safe-return-path";

test("authentication preserves local paths, queries, and question anchors", () => {
  assert.equal(safeReturnPath("/account?tab=profile"), "/account?tab=profile");
  assert.equal(safeReturnPath("/alexandria-ocasio-cortez#ask-question"), "/alexandria-ocasio-cortez#ask-question");
  assert.equal(safeReturnPath("/verify?step=2#email"), "/verify?step=2#email");
});

test("callback destinations reject external URLs and URL userinfo tricks", () => {
  for (const path of ["https://example.test", "//example.test", "@example.test", "javascript:alert(1)", "/\\example.test", "/foo\\bar", "/\t/example.test", "/\n/example.test", "/\u0000example.test", ["/account"], undefined]) {
    assert.equal(safeReturnPath(path), "/");
  }
});

test("normalization cannot turn a local path into a protocol-relative redirect", () => {
  assert.equal(safeReturnPath("/foo/..//example.test"), "/");
  assert.equal(safeReturnPath("/foo/%2e%2e//example.test"), "/");
  assert.equal(safeReturnPath("/foo/../account?tab=votes"), "/account?tab=votes");
  assert.equal(new URL(safeReturnPath("@example.test"), "https://whytho.example").origin, "https://whytho.example");
});
