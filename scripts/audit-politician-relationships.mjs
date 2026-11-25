/** Read-only counts and non-content references for identity reconciliation planning. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.argv[2] || "outputs/politician-identity-audit-20261122");
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("Supabase environment unavailable");
const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" };
const startedAt = new Date().toISOString();
const roster = JSON.parse(await readFile(resolve(output, "politicians.json"), "utf8"));
const schema = JSON.parse(await readFile(resolve(output, "live-schema.json"), "utf8"));
async function readAll(table, select, filters = {}) {
  const rows = [];
  let expected;
  for (let offset = 0; ; offset += 500) {
    const url = new URL(`/rest/v1/${table}`, base);
    for (const [name, value] of Object.entries({ select, order: "id.asc", limit: 500, offset, ...filters })) url.searchParams.set(name, String(value));
    const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(25000) });
    const data = await response.json();
    if (!response.ok) throw new Error(`${table}: ${response.status} ${data.code || ""} ${data.message || ""}`);
    const total = Number(response.headers.get("content-range")?.split("/")[1]);
    if (expected === undefined) expected = total;
    if (Number.isFinite(expected) && expected !== total) throw new Error(`${table}: count changed`);
    rows.push(...data);
    if (data.length < 500) break;
  }
  if (Number.isFinite(expected) && rows.length !== expected) throw new Error(`${table}: incomplete capture`);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`${table}: duplicate page IDs`);
  return rows;
}
const relations = ["questions", "answers", "politician_team", "weekly_snapshots", "politician_verifications", "politician_aliases", "race_candidates", "x_posts", "x_outreach_log", "politician_photo_history", "politician_verification_sources", "answer_media"];
const counts = await readAll("politicians", ["id", ...relations.map(table => `${table}(count)`), "user_questions:questions(count)", "official_answers:answers(count)"].join(","), {
  "user_questions.source": "eq.user", "user_questions.is_seeded": "eq.false",
  "official_answers.answer_type": "in.(direct,team_statement)", "official_answers.is_ai_generated": "eq.false", "official_answers.is_draft": "eq.false",
});
if (counts.length !== roster.length || counts.some(row => !roster.some(person => person.id === row.id))) throw new Error("Roster changed before relationship capture");
function count(value) {
  const number = Array.isArray(value) ? value[0]?.count : value?.count;
  if (!Number.isInteger(number) || number < 0) throw new Error("Malformed embedded count");
  return number;
}
const byId = Object.fromEntries(counts.map(row => [row.id, Object.fromEntries(Object.entries(row).filter(([field]) => field !== "id").map(([field, value]) => [field, count(value)]))]));
const extra = {};
const unavailable = {};
for (const [table, select] of [
  ["votes", "id,question_id,questions!inner(politician_id)"],
  ["races", "id,incumbent_id"],
  ["politician_account_audit", "id,politician_id"],
  ["chatbot_question_posts", "id,politician_ids"],
  ["weekly_snapshots", "id,politician_id,week_number,total_questions,qualifying_questions,answered_qualifying"],
  ["question_notification_events", "id,politician_id,question_id"],
]) {
  if (!schema[table]) { unavailable[table] = "Not exposed in captured service-role REST schema; deployment/catalog verification required."; continue; }
  try { extra[table] = await readAll(table, select); }
  catch (error) { unavailable[table] = error.message; }
}
for (const row of extra.votes || []) {
  const id = row.questions?.politician_id;
  if (byId[id]) byId[id].votes = (byId[id].votes || 0) + 1;
}
for (const row of extra.races || []) if (byId[row.incumbent_id]) byId[row.incumbent_id].incumbent_races = (byId[row.incumbent_id].incumbent_races || 0) + 1;
for (const row of extra.politician_account_audit || []) if (byId[row.politician_id]) byId[row.politician_id].account_audit = (byId[row.politician_id].account_audit || 0) + 1;
for (const row of extra.chatbot_question_posts || []) for (const id of new Set(row.politician_ids || [])) if (byId[id]) byId[id].chatbot_posts = (byId[id].chatbot_posts || 0) + 1;
const result = { startedAt, finishedAt: new Date().toISOString(), byId, unavailable, extra };
await writeFile(resolve(output, "relationships.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({startedAt, finishedAt: result.finishedAt, profiles: counts.length, totals: Object.fromEntries([...relations, "user_questions", "official_answers", "votes", "incumbent_races", "account_audit", "chatbot_posts"].map(field => [field, Object.values(byId).reduce((sum, row) => sum + (row[field] || 0), 0)])), unavailable}, null, 2));
