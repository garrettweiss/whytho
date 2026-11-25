import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProfile, collectionTargets, idChunks, identityMemberIds, normalizedJackName, normalizedJackState, uniqueCanonicalMatch, verifiedIdentityHandle, type JackProfile } from "./jack-identity";

function profile(id: string, extra: Partial<JackProfile> = {}): JackProfile {
  return { id, canonical_politician_id: null, slug: id, full_name: "Alexandria Ocasio-Cortez", office: "U.S. Representative", state: "NY", bioguide_id: null, social_handles: {}, verification_tier: "0", is_active: true, is_test: false, ...extra };
}

test("canonical collection retains source IDs and only collects a verified identity once", () => {
  const rows = [profile("official", { state: "New York", social_handles: { twitter: "RepAOC", twitter_confidence: "verified" } }), profile("candidate", { canonical_politician_id: "official", social_handles: { twitter: "@repaoc", twitter_confidence: "inferred" } })];
  assert.deepEqual(collectionTargets(rows).map(row => row.id), ["official"]);
  assert.equal(canonicalProfile(rows, "candidate")?.slug, "official");
  assert.deepEqual(identityMemberIds(rows, "official"), ["official", "candidate"]);
  assert.equal(rows[1]!.id, "candidate");
  assert.equal(normalizedJackState(rows[0]!.state), normalizedJackState(rows[1]!.state));
});

test("missing, inferred, malformed and conflicting handles fail closed", () => {
  const root = profile("official", { social_handles: { twitter: "RepAOC", twitter_confidence: "verified" } });
  assert.equal(verifiedIdentityHandle([profile("missing")], "missing"), null);
  assert.equal(verifiedIdentityHandle([profile("inferred", { social_handles: { twitter: "RepAOC", twitter_confidence: "inferred" } })], "inferred"), null);
  assert.equal(verifiedIdentityHandle([profile("invalid", { social_handles: { twitter: "https://x.com/RepAOC", twitter_confidence: "verified" } })], "invalid"), null);
  const conflicting = profile("candidate", { canonical_politician_id: "official", social_handles: { twitter: "WrongPerson", twitter_confidence: "inferred" } });
  assert.equal(verifiedIdentityHandle([root, conflicting], "official"), null);
  assert.deepEqual(collectionTargets([root, conflicting]), []);
});

test("different unreviewed identities sharing a handle are both held", () => {
  const rows = [profile("one", { social_handles: { twitter: "RepAOC", twitter_confidence: "verified" } }), profile("two", { social_handles: { twitter: "repaoc", twitter_confidence: "verified" } })];
  assert.deepEqual(collectionTargets(rows), []);
  assert.equal(uniqueCanonicalMatch(rows, rows), undefined);
  rows[1]!.social_handles = { twitter: "repaoc", twitter_confidence: "inferred" };
  assert.deepEqual(collectionTargets(rows), [], "an inferred competing owner is still ambiguous");
  rows.push(profile("alias", { canonical_politician_id: "two", social_handles: { twitter: "OtherAccount", twitter_confidence: "verified" } }));
  assert.deepEqual(collectionTargets(rows), [], "an internally conflicting competing identity cannot release its handle");
});

test("inactive or test roots and broken multi-hop mappings cannot authorize processing", () => {
  assert.equal(canonicalProfile([profile("inactive", { is_active: false })], "inactive"), undefined);
  assert.equal(canonicalProfile([profile("test", { is_test: true })], "test"), undefined);
  assert.equal(canonicalProfile([profile("alias", { canonical_politician_id: "missing" })], "alias"), undefined);
  const rows = [profile("a", { canonical_politician_id: "b" }), profile("b", { canonical_politician_id: "c" }), profile("c")];
  assert.equal(canonicalProfile(rows, "a"), undefined);
});

test("reviewed aliases collapse unique matches without first-name matching", () => {
  const rows = [profile("root"), profile("alias", { canonical_politician_id: "root" })];
  assert.equal(uniqueCanonicalMatch(rows, rows)?.id, "root");
  assert.notEqual(normalizedJackName("Mike Johnson"), normalizedJackName("Michael T. Johnson"));
  assert.notEqual(normalizedJackName("John Smith"), normalizedJackName("John Doe"));
  assert.equal(normalizedJackName("André Carson"), normalizedJackName("Andre Carson"));
  assert.equal(normalizedJackState("Atlantis"), null);
});

test("ID membership requests stay bounded and do not lose source members", () => {
  const ids = Array.from({ length: 1001 }, (_, i) => `id-${i}`);
  const chunks = idChunks([...ids, ids[0]!]);
  assert.deepEqual(chunks.map(chunk => chunk.length), [200, 200, 200, 200, 200, 1]);
  assert.deepEqual(chunks.flat(), ids);
});
