import assert from "node:assert/strict";
import test from "node:test";
import { candidateRecordLabel, electionDateLabel, electionDirectoryHref, electionPhaseLabel, electionToday, exactElectionTotal, isElectionDate, parseElectionFilters, parseElectionPage, readCandidateCount } from "./helpers";

test("changing office retains the selected state and election period", () => {
  const filters = parseElectionFilters({ state: "ca", filter: "senate", period: "past", page: "3" });
  assert.deepEqual(filters, { state: "CA", office: "senate", period: "past", page: 3 });
  assert.equal(electionDirectoryHref(filters, { office: "house", page: 1 }), "/races?filter=house&state=CA&period=past");
  assert.equal(electionDirectoryHref(filters, { page: 4 }), "/races?filter=senate&state=CA&period=past&page=4");
});

test("page and filter parsing keeps arbitrary user input out of database filters", () => {
  assert.equal(parseElectionPage("2"), 2);
  for (const value of ["0", "-2", "1.5", "900000", "10x", ["2"], undefined]) assert.equal(parseElectionPage(value), 1);
  assert.deepEqual(parseElectionFilters({ state: "CA,OR", filter: "office.eq.admin", period: "unknown" }), { state: "", office: "all", period: "upcoming", page: 1 });
});

test("election dates stay date-only and respect real calendar dates", () => {
  assert.equal(isElectionDate("2028-02-29"), true);
  assert.equal(isElectionDate("2026-02-29"), false);
  assert.equal(isElectionDate("2026-13-02"), false);
  assert.equal(electionDateLabel("2026-11-03"), "Nov 3, 2026");
  assert.equal(electionDateLabel("not-a-date"), "Date not confirmed");
});

test("day boundaries use the U.S. Eastern calendar rather than the server timezone", () => {
  assert.equal(electionToday(new Date("2026-11-04T02:00:00Z")), "2026-11-03");
  assert.equal(electionToday(new Date("2026-11-04T06:00:00Z")), "2026-11-04");
});

test("a past date does not establish election completion or a winner", () => {
  assert.equal(electionPhaseLabel({ election_date: "2026-11-03", status: "active" }, "2026-11-04"), "Past election");
  assert.equal(electionPhaseLabel({ election_date: "2026-11-03", status: "active" }, "2026-11-03"), "Election date today");
  assert.equal(electionPhaseLabel({ election_date: "2026-11-03", status: "completed" }, "2026-11-04"), "Recorded as completed");
  assert.equal(candidateRecordLabel({ candidate_status: null, is_active: true }), "Profile linked to this race");
  assert.equal(candidateRecordLabel({ candidate_status: null, is_active: false }), "Inactive profile linked to this race");
  assert.equal(candidateRecordLabel({ candidate_status: "won", is_active: true }), "Recorded result: won");
});

test("exact aggregate counts are not limited by the returned candidate row limit", () => {
  assert.equal(readCandidateCount([{ count: 1528 }]), 1528);
  assert.equal(readCandidateCount([{ count: 0 }]), 0);
  assert.equal(exactElectionTotal(5001), 5001);
});

test("missing or malformed counts are failures, never fabricated empty results", () => {
  for (const value of [null, [], [{ count: -1 }], [{ count: "12" }], [{ count: 1.2 }]]) assert.throws(() => readCandidateCount(value));
  assert.throws(() => exactElectionTotal(null));
  assert.throws(() => exactElectionTotal(-1));
});
