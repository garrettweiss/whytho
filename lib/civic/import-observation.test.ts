import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import {
  fecObservation, findCanonicalIncumbent, findExistingFederalRace,
  importCivicObservation, officialObservation, shouldApplyImport,
} from "./import-observation";
import {
  deduplicatePoliticians, normalizeCongressMember, normalizeFecName,
  normalizeOpenStatesPerson, normalizeStateCode,
} from "./normalize";

const ROOT = "10000000-0000-0000-0000-000000000001";
const DUPLICATE = "10000000-0000-0000-0000-000000000002";
const OTHER = "10000000-0000-0000-0000-000000000003";
const fec = {
  candidate_id: "H8NY15148", name: "OCASIO-CORTEZ, ALEXANDRIA", office: "H",
  state: "NY", district: "14", party: "DEM", incumbent_challenge: "I",
};
const identity = { canonical_id: ROOT, canonical_slug: "alexandria-ocasio-cortez-new-york", member_ids: [ROOT, DUPLICATE] };

function rpcClient(result: unknown, error: unknown = null) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { abortSignal: async () => ({ data: result, error }) };
    },
    from() { throw new Error("Unexpected direct database access"); },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

test("NY and New York normalize to one state while names preserve distinguishing evidence", () => {
  assert.equal(normalizeStateCode(" New York "), "NY");
  assert.equal(normalizeStateCode("ny"), "NY");
  assert.throws(() => normalizeStateCode("not a state"));
  assert.equal(normalizeFecName("SMITH, JOHN A., JR."), "John A. Smith Jr.");
  assert.equal(normalizeFecName("SMITH III, JOHN B"), "John B. Smith III");
  assert.equal(normalizeFecName("GARCÍA, JOSÉ LUIS"), "José Luis García");
  assert.notEqual(normalizeFecName("SMITH, JOHN A"), normalizeFecName("SMITH, JOHN B"));
});

test("Congress at-large district and source fields survive without shipping authority resets", () => {
  const normalized = normalizeCongressMember({
    bioguideId: "B001234", name: "Example, Jane", state: "Alaska", district: 0,
    party: "D", chamber: "House of Representatives",
  });
  const observation = officialObservation(normalized);
  assert.equal(observation.namespace, "congress.bioguide");
  assert.equal(observation.externalId, "B001234");
  assert.equal(observation.record.state, "AK");
  assert.equal(observation.record.district, "0");
  assert.match(observation.record.photo_url ?? "", /B001234/);
  assert.match(observation.record.photo_source_url ?? "", /congress.gov/);
  for (const key of ["slug", "verification_tier", "social_handles", "is_active", "is_test", "politician_type"]) {
    assert.equal(key in observation.record, false, `Must not reset ${key}`);
  }
});

test("OpenStates provider IDs prevent same-name source records from being dropped", () => {
  const one = normalizeOpenStatesPerson({
    id: "ocd-person:one", name: "Jane Smith", party: "Democratic",
    jurisdiction: { id: "ocd-jurisdiction/country:us/state:ny/legislature", name: "New York", classification: "state" },
    ids: { bioguide: "B001234" },
  });
  const two = { ...one, politician: { ...one.politician, openstates_id: "ocd-person:two" } };
  assert.equal(deduplicatePoliticians([one, two, one]).length, 2);
  const richer = { ...one, politician: { ...one.politician, website_url: "https://example.com/official" } };
  assert.equal(deduplicatePoliticians([one, richer]).length, 2);
  assert.equal(officialObservation(one).namespace, "openstates.person");
  assert.equal(officialObservation(one).record.bioguide_id, "B001234");
  const noIds = { ...one, politician: { ...one.politician, openstates_id: null, bioguide_id: null } };
  assert.equal(deduplicatePoliticians([noIds, noIds]).length, 2);
  assert.throws(() => officialObservation(noIds), /Missing provider ID/);
});

test("both FEC writers share one provider namespace and preserve historical candidacy", () => {
  const one = fecObservation(fec, 2026, OTHER);
  const two = fecObservation({ ...fec, state: "New York", district: "014" }, 2028);
  assert.equal(one.namespace, "fec.candidate");
  assert.equal(one.externalId, two.externalId);
  assert.equal(one.record.state, two.record.state);
  assert.equal(one.record.district, two.record.district);
  assert.equal(one.record.candidate_election_year, 2026);
  assert.equal(two.record.candidate_election_year, 2028);
  assert.equal(one.record.race_id, OTHER);
  assert.equal("is_active" in one.record, false);
  assert.equal("politician_type" in one.record, false);
  assert.equal(fecObservation({ ...fec, party: null }, 2026).record.party, null);
});

test("preview is the default and contradictory flags fail closed", () => {
  assert.equal(shouldApplyImport([]), false);
  assert.equal(shouldApplyImport(["--dry-run"]), false);
  assert.equal(shouldApplyImport(["--apply"]), true);
  assert.throws(() => shouldApplyImport(["--dry-run", "--apply"]), /Choose/);
});

test("preview and repeated legacy FEC resolutions use only the transactional resolver", async () => {
  const { client, calls } = rpcClient({ ...identity, status: "matched", candidate_ids: [], reason: null, applied: false, photo_status: "not_provided" });
  const observation = fecObservation(fec, 2026);
  const first = await importCivicObservation(client, observation);
  const second = await importCivicObservation(client, observation);
  assert.equal(first.canonicalId, ROOT);
  assert.deepEqual(first, second);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.name, "ingest_politician_identity");
    assert.equal(call.args.p_apply, false);
    assert.equal(call.args.p_namespace, "fec.candidate");
  }
});

test("source lookup failures and ambiguous identity results never become client inserts", async () => {
  const failed = rpcClient(null, { message: "database unavailable" });
  await assert.rejects(importCivicObservation(failed.client, fecObservation(fec, 2026), true), /no absence was inferred/);
  assert.equal(failed.calls.length, 1);
  const ambiguous = rpcClient({
    status: "review_required", canonical_id: null, canonical_slug: null,
    member_ids: [], candidate_ids: [ROOT, OTHER], reason: "ambiguous_provider_id", applied: false, photo_status: "not_provided",
  });
  const result = await importCivicObservation(ambiguous.client, fecObservation(fec, 2026), true);
  assert.equal(result.status, "review_required");
  assert.equal(result.canonicalId, null);
  assert.equal(ambiguous.calls.length, 1);
});

function incumbentClient(
  rows: Array<{ id: string; state: string; district: string | null }>,
  error: { message: string } | null = null,
  roots: Record<string, string> = {}
) {
  const ranges: number[][] = [];
  const filters: Array<[string, unknown]> = [];
  const query = {
    select() { return this; },
    eq(column: string, value: unknown) { filters.push([column, value]); return this; },
    order(column: string) { assert.equal(column, "id"); return this; },
    async range(start: number, end: number) { ranges.push([start, end]); return { data: rows.slice(start, end + 1), error }; },
  };
  const client = {
    from(table: string) { assert.equal(table, "politicians"); return query; },
    rpc(name: string, args: { p_id: string }) {
      assert.equal(name, "resolve_politician_identity");
      const root = roots[args.p_id] ?? args.p_id;
      return { abortSignal: async () => ({ data: { canonical_id: root, canonical_slug: "example", member_ids: [...new Set([root, args.p_id])] }, error: null }) };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, ranges, filters };
}

test("race incumbent resolution respects House district and state-name variants", async () => {
  const { client, filters } = incumbentClient([
    { id: ROOT, state: "New York", district: "14" },
    { id: DUPLICATE, state: "NY", district: "014" },
    { id: OTHER, state: "NY", district: "15" },
  ], null, { [DUPLICATE]: ROOT });
  assert.equal(await findCanonicalIncumbent(client, "U.S. Representative", "NY", "14"), ROOT);
  assert.ok(filters.some(([key, value]) => key === "office" && value === "U.S. Representative"));
  assert.ok(filters.some(([key, value]) => key === "is_test" && value === false));
});

test("race lookups reject errors and ambiguous distinct incumbents", async () => {
  const ambiguous = incumbentClient([
    { id: ROOT, state: "New York", district: null }, { id: OTHER, state: "NY", district: null },
  ]);
  await assert.rejects(findCanonicalIncumbent(ambiguous.client, "Governor", "NY"), /Ambiguous/);
  const failed = incumbentClient([], { message: "read failed" });
  await assert.rejects(findCanonicalIncumbent(failed.client, "Governor", "NY"), /lookup failed/);
});

test("full incumbent scans use stable 1000-row pages", async () => {
  const rows = Array.from({ length: 1001 }, () => ({ id: OTHER, state: "CA", district: "1" }));
  rows.push({ id: ROOT, state: "NY", district: "14" });
  const { client, ranges } = incumbentClient(rows);
  assert.equal(await findCanonicalIncumbent(client, "U.S. Representative", "NY", "14"), ROOT);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
});

test("missing FEC races stay unlinked and race query errors do not fabricate races", async () => {
  const slugs: string[] = [];
  const query = {
    select() { return this; },
    eq(key: string, value: string) { assert.equal(key, "slug"); slugs.push(value); return this; },
    async maybeSingle() { return { data: null, error: null as { message: string } | null }; },
  };
  const client = { from: () => query } as unknown as SupabaseClient<Database>;
  assert.equal(await findExistingFederalRace(client, fecObservation(fec, 2026), 2026), null);
  assert.deepEqual(slugs, ["ny-house-14-primary-2026"]);
  query.maybeSingle = async () => ({ data: null, error: { message: "timeout" } });
  await assert.rejects(findExistingFederalRace(client, fecObservation(fec, 2026), 2026), /Race lookup failed/);
});
