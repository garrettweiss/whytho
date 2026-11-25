/** Read-only identity inventory. Uses GET only; never changes production data. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const output = resolve(process.argv[2] || "outputs/politician-identity-audit-20261122");
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("Supabase environment unavailable");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const startedAt = new Date().toISOString();
await mkdir(output, { recursive: true });

async function get(path, params = {}, accept) {
  const url = new URL(`/rest/v1/${path}`, base);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  const response = await fetch(url, {
    method: "GET", headers: { ...headers, Prefer: "count=exact", ...(accept ? { Accept: accept } : {}) },
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${data.code || ""} ${data.message || ""}`);
  return { data, total: Number(response.headers.get("content-range")?.split("/")[1]) };
}

// Explicit, stable 500-row paging stays below PostgREST's maximum response size.
async function readAll(table, select, filters = {}) {
  const rows = [];
  let expected;
  for (let offset = 0; ; offset += 500) {
    const page = await get(table, { select, order: "id.asc", limit: 500, offset, ...filters });
    if (expected === undefined) expected = page.total;
    if (Number.isFinite(expected) && page.total !== expected) throw new Error(`${table}: count changed during capture`);
    rows.push(...page.data);
    if (page.data.length < 500) break;
  }
  if (Number.isFinite(expected) && rows.length !== expected) throw new Error(`${table}: incomplete pagination ${rows.length}/${expected}`);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`${table}: duplicated page IDs`);
  return rows;
}

const fields = "id,slug,full_name,aliases,office,state,district,party,politician_type,is_active,is_test,is_candidate,incumbent_challenge,verification_tier,fec_id,fec_candidate_id,candidate_fec_id,bioguide_id,openstates_id,govtrack_id,votesmart_id,photo_url,photo_source_url,photo_credit,photo_rights_basis,bio,website_url,social_handles,candidate_election_year,candidate_office,candidate_status,election_date,race_id,created_at,updated_at";
const politicians = await readAll("politicians", fields);
await writeFile(resolve(output, "politicians.json"), JSON.stringify(politicians, null, 2) + "\n");

// Read the live exposed schema, then retain column/relationship metadata only.
let schema;
try {
  const result = await get("", {}, "application/openapi+json");
  schema = Object.fromEntries(Object.entries(result.data.definitions || {}).map(([table, definition]) => [table, {
    required: definition.required || [],
    columns: Object.fromEntries(Object.entries(definition.properties || {}).map(([name, column]) => [name, {
      type: column.type, format: column.format, description: column.description,
    }])),
  }]));
} catch (error) { schema = { error: error.message }; }
await writeFile(resolve(output, "live-schema.json"), JSON.stringify(schema, null, 2) + "\n");
const manifest = {
  startedAt, finishedAt: new Date().toISOString(), rowCount: politicians.length,
  activeNonTest: politicians.filter(row => row.is_active && !row.is_test).length,
  testRows: politicians.filter(row => row.is_test).length,
  capture: "Read-only service-role GET, ordered 500-row pages with exact count and ID uniqueness checks. Not a transaction snapshot.",
  sha256: createHash("sha256").update(JSON.stringify(politicians)).digest("hex"),
};
await writeFile(resolve(output, "capture.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
