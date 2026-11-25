import assert from "node:assert/strict";
import test from "node:test";
import { readPoliticianIdentity, resolvePoliticianIdentity, type IdentityClient } from "./client";
import { importPoliticianIdentity } from "./import";
import { normalizeIdentityDistrict, normalizeIdentityName, normalizeIdentityState } from "./normalize";

const root = "10000000-0000-4000-8000-000000000001";
const alias = "10000000-0000-4000-8000-000000000002";
const payload = { canonical_id: root, canonical_slug: "alexandria-original", member_ids: [root, alias] };

test("identity parser distinguishes absence from invalid and unbounded mappings", () => {
  assert.equal(readPoliticianIdentity(null), null);
  assert.deepEqual(readPoliticianIdentity(payload), { canonicalId: root, canonicalSlug: "alexandria-original", memberIds: [root, alias] });
  for (const invalid of [undefined, {}, { ...payload, member_ids: [alias] }, { ...payload, member_ids: [root, root] }, { ...payload, member_ids: Array(201).fill(root) }, { ...payload, canonical_slug: "//elsewhere" }]) {
    assert.throws(() => readPoliticianIdentity(invalid), /Invalid politician identity/);
  }
});

test("identity lookup never treats missing schema or transport error as a self match", async () => {
  const client = { rpc: () => ({ abortSignal: async () => ({ data: null, error: { code: "PGRST202" } }) }) } as unknown as IdentityClient;
  await assert.rejects(resolvePoliticianIdentity(alias, client), /lookup unavailable/);
});

test("provider normalization handles full states, territories, accents and at-large districts", () => {
  assert.equal(normalizeIdentityState(" New York "), "NY");
  assert.equal(normalizeIdentityState("Puerto Rico"), "PR");
  assert.equal(normalizeIdentityState("Washington DC"), "DC");
  assert.equal(normalizeIdentityState("American Samoa"), "AS");
  assert.equal(normalizeIdentityName("José García"), normalizeIdentityName("Jose Garcia"));
  assert.equal(normalizeIdentityDistrict("014"), "14");
  assert.equal(normalizeIdentityDistrict("At Large"), "0");
  assert.equal(normalizeIdentityDistrict(undefined), null);
  assert.throws(() => normalizeIdentityState("unknown"), /recognized/);
});

test("import preview remains read-only by default and errors remain errors", async () => {
  let request: Record<string, unknown> | undefined;
  const client = { rpc: (_name: string, args: Record<string, unknown>) => {
    request = args;
    return { abortSignal: async () => ({ data: { status: "would_create", canonical_id: null, canonical_slug: null, member_ids: [], candidate_ids: [], reason: null, applied: false, photo_status: "not_provided" }, error: null }) };
  } } as unknown as IdentityClient;
  const result = await importPoliticianIdentity(client, { namespace: "congress.bioguide", externalId: "A123456", record: { full_name: "New Person", state: "New York", office: "Representative", district: "014" } });
  assert.equal(request?.p_apply, false);
  assert.equal((request?.p_record as { state: string }).state, "NY");
  assert.equal(result.status, "would_create");
  assert.equal(result.photoStatus, "not_provided");
  const failed = { rpc: () => ({ abortSignal: async () => ({ data: null, error: { code: "57014" } }) }) } as unknown as IdentityClient;
  await assert.rejects(importPoliticianIdentity(failed, { namespace: "congress.bioguide", externalId: "A123456", record: { full_name: "New Person", state: "NY", office: null } }), /no absence was inferred/);
});
