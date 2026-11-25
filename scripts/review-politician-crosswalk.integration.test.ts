import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type Row = Record<string, unknown> & { id: string };
type Crosswalk = { id: { bioguide: string; fec: string[]; govtrack?: number }; name: { official_full: string }; terms?: Array<{ type: string; state: string; start: string; end: string; party: string; party_affiliations?: Array<{ start: string; end: string; party: string }> }> };
const script = resolve(process.cwd(), "scripts/review-politician-crosswalk.mjs");
const makeRow = (id: string, fields: Record<string, unknown> = {}): Row => ({
  id, slug: id, full_name: "Jane Smith", bioguide_id: null, candidate_fec_id: null,
  fec_id: null, fec_candidate_id: null, openstates_id: null, govtrack_id: null, votesmart_id: null,
  verification_tier: "0", is_test: false, is_active: true, office: "U.S. Representative", state: "NY", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
  ...fields,
});
const crosswalk: Crosswalk[] = [{ id: { bioguide: "B000001", fec: ["H0NY00001"] }, name: { official_full: "Jane Smith" } }];

function runFixture(rows: Row[], people = crosswalk, options: { claims?: string[]; wrongHash?: boolean; rejected?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "whytho-crosswalk-test-"));
  const counts = Object.fromEntries(rows.map(row => [row.id, {
    politician_team: options.claims?.includes(row.id) ? 1 : 0, politician_verifications: 0, politician_verification_sources: 0,
    official_answers: 0, answers: 0, questions: row.bioguide_id ? 3 : 0,
  }]));
  const files: Record<string, unknown> = {
    "politicians.json": rows,
    "capture.json": { rowCount: rows.length, finishedAt: "2026-11-23T00:00:00Z", sha256: options.wrongHash ? "wrong" : createHash("sha256").update(JSON.stringify(rows)).digest("hex") },
    "relationships.json": { byId: counts },
    "review-manifest.json": [{
      group_id: "original", ids: rows.map(row => row.id), tier: "strong_cross_source_candidate",
      status: options.rejected ? "rejected_namesake_match" : "pending_identity_review",
      suggested_anchor_if_identity_confirmed: { id: rows[0]!.id },
    }],
    "supplemental-name-review.json": [],
    "legislators-current.json": people,
    "legislators-historical.json": [],
  };
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), JSON.stringify(value));
  const result = spawnSync(process.execPath, [script, directory], { encoding: "utf8" });
  const report = result.status === 0 ? JSON.parse(readFileSync(join(directory, "reviewed-crosswalk-links.json"), "utf8")) : null;
  return { result, report, directory };
}

test("explicit crosswalk IDs verify different display names, preserve strong anchor, and never authorize apply", () => {
  const rows = [makeRow("official", { bioguide_id: "B000001", full_name: "Jane Smith", photo_url: "https://example.com/portrait.jpg" }),
    makeRow("candidate", { candidate_fec_id: "H0NY00001", full_name: "Jane A. Smith" })];
  const { report, result } = runFixture(rows);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.summary.verified_identity_groups, 1);
  assert.equal(report.links[0].canonical_id, "official");
  assert.equal(report.links[0].source_id, "candidate");
  assert.equal(report.links[0].approved_to_apply, false);
  assert.equal(report.links[0].evidence.approved_to_apply, false);
  assert.equal(report.links[0].requires_live_revalidation, true);
  assert.match(report.links[0].evidence.crosswalk_entries[0].file_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.links[0].fields, {});
});

test("same-name father and son with different explicit crosswalk identities stay separate", () => {
  const people = [
    { id: { bioguide: "M000639", fec: ["H2NJ13075"] }, name: { official_full: "Robert Menendez" } },
    { id: { bioguide: "M001226", fec: ["H2NJ08232"] }, name: { official_full: "Robert Menendez" } },
  ];
  const { report } = runFixture([
    makeRow("son", { bioguide_id: "M001226", full_name: "Robert Menendez" }),
    makeRow("father", { candidate_fec_id: "H2NJ13075", full_name: "Robert Menendez" }),
  ], people);
  assert.equal(report.links.length, 0);
  assert.equal(report.core_cohort_review[0].status, "rejected_distinct_crosswalk_people");
});

test("claims, test records, provider conflicts and prior rejection each veto automatic review links", () => {
  const clean = [makeRow("official", { bioguide_id: "B000001" }), makeRow("candidate", { candidate_fec_id: "H0NY00001" })];
  for (const [rows, options] of [
    [clean, { claims: ["candidate"] }],
    [[clean[0]!, { ...clean[1]!, is_test: true }], {}],
    [[{ ...clean[0]!, openstates_id: "one" }, { ...clean[1]!, openstates_id: "two" }], {}],
    [clean, { rejected: true }],
  ] as const) {
    const { report, result } = runFixture([...rows], crosswalk, { ...options, claims: "claims" in options ? [...options.claims] : undefined });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.links.length, 0);
    assert.equal(report.held_groups.length, 1);
  }
});

test("ambiguous provider mapping or conflicting extra FEC IDs never become approval", () => {
  const rows = [makeRow("official", { bioguide_id: "B000001" }), makeRow("candidate", { candidate_fec_id: "H0NY00001" })];
  const ambiguous = [...crosswalk, { id: { bioguide: "B000002", fec: ["H0NY00001"] }, name: { official_full: "Other Person" } }];
  assert.equal(runFixture(rows, ambiguous).report.links.length, 0);
  const extra = [{ ...rows[0]!, fec_id: "UNVERIFIED" }, rows[1]!];
  assert.equal(runFixture(extra).report.links.length, 0);
});

test("capture mismatch fails before producing a review manifest", () => {
  const { result, report } = runFixture([makeRow("one")], crosswalk, { wrongHash: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /capture hash\/count\/identity check failed/);
  assert.equal(report, null);
});

test("same input produces the same link decisions and profiles remain byte-for-byte unchanged", () => {
  const rows = [makeRow("official", { bioguide_id: "B000001" }), makeRow("candidate", { fec_candidate_id: "H0NY00001" })];
  const first = runFixture(rows), second = runFixture(rows);
  assert.deepEqual(first.report.links, second.report.links);
  assert.deepEqual(JSON.parse(readFileSync(join(first.directory, "politicians.json"), "utf8")), rows);
});

test("party fill requires donor agreement with a dated active Congress term and never overwrites", () => {
  const people = [{ ...crosswalk[0]!, terms: [{ type: "rep", state: "NY", start: "2025-01-03", end: "2027-01-03", party: "Democrat" }] }];
  const rows = [makeRow("official", { bioguide_id: "B000001", party: null }), makeRow("candidate", { candidate_fec_id: "H0NY00001", party: "Democratic" })];
  const verified = runFixture(rows, people).report;
  assert.equal(verified.links[0].fields.party, "Democrat");
  assert.equal(verified.links[0].evidence.field_provenance.party.donors[0].id, "candidate");
  assert.equal(verified.links[0].evidence.field_provenance.party.proofs[0].term.start, "2025-01-03");
  const populated = runFixture([{ ...rows[0]!, party: "Republican" }, rows[1]!], people).report;
  assert.deepEqual(populated.links[0].fields, {});
  const conflicting = runFixture([rows[0]!, { ...rows[1]!, party: "Republican" }], people).report;
  assert.deepEqual(conflicting.links[0].fields, {});
  assert.match(conflicting.groups[0].field_review.party.reason, /conflicts/);
});

test("expired or changing party affiliation cannot supply an undated donor fill", () => {
  const rows = [makeRow("official", { bioguide_id: "B000001", party: null }), makeRow("candidate", { candidate_fec_id: "H0NY00001", party: "Republican" })];
  const expired = [{ ...crosswalk[0]!, terms: [{ type: "rep", state: "NY", start: "2023-01-03", end: "2025-01-03", party: "Republican" }] }];
  assert.deepEqual(runFixture(rows, expired).report.links[0].fields, {});
  const changed = [{ ...crosswalk[0]!, terms: [{ type: "rep", state: "NY", start: "2025-01-03", end: "2027-01-03", party: "Independent", party_affiliations: [
    { start: "2025-01-03", end: "2026-03-08", party: "Republican" }, { start: "2026-03-09", end: "2027-01-03", party: "Independent" },
  ] }] }];
  assert.deepEqual(runFixture(rows, changed).report.links[0].fields, {});
});
