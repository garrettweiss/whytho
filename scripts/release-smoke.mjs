import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

// Read-only release checks. No credentials, civic writes, or auth submissions.
const origin = new URL(process.argv[2] || "http://127.0.0.1:8771").origin;
const results = [];
async function check(name, work) {
  try { await work(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
async function read(path) {
  return fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(30000) });
}
async function directory(query = "") {
  const response = await read(`/api/politicians/directory${query}`);
  assert.equal(response.status, 200);
  return { response, data: await response.json() };
}
let first;
await check("Health checks pass with populated civic data", async () => {
  const response = await read("/api/health");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.ok(data.checks.every((item) => item.ok));
  assert.equal(data.vitals, undefined);
});
await check("Homepage has the redesigned search and real politician links", async () => {
  const response = await read("/");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const html = await response.text();
  assert.match(html, /Who do you/);
  assert.match(html, /find-politician/);
  assert.match(html, /Find politicians/);
});
await check("Directory is bounded, public, and cacheable", async () => {
  const { response, data } = await directory(); first = data;
  assert.equal(data.people.length, 24);
  assert.ok(data.nextCursor);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(response.headers.get("cache-control"), /s-maxage=300/);
  const keys = ["id", "slug", "full_name", "politician_type", "is_candidate", "incumbent_challenge", "office", "state", "party", "photo_url", "questionCount", "replyCount"];
  for (const person of data.people) {
    assert.ok(Object.keys(person).every((key) => keys.includes(key)));
    assert.ok(Number.isInteger(person.questionCount) && person.questionCount >= 0);
    assert.ok(Number.isInteger(person.replyCount) && person.replyCount >= 0);
  }
});
await check("Infinite directory continuation has no duplicate IDs", async () => {
  assert.ok(first?.nextCursor);
  const { data } = await directory(`?cursor=${encodeURIComponent(first.nextCursor)}`);
  assert.equal(data.weekNumber, first.weekNumber);
  const ids = [...first.people, ...data.people].map((person) => person.id);
  assert.equal(new Set(ids).size, ids.length);
});
await check("Composed state and office search stays scoped", async () => {
  const { data } = await directory("?state=CA&office=us-senate");
  assert.ok(data.people.length > 0);
  assert.ok(data.people.every((person) => ["CA", "California"].includes(person.state) && person.office === "U.S. Senator"));
});
for (const query of ["?state=invalid", "?cursor=broken", "?scope=invalid", "?q=a&q=b", "?limit=100000"]) {
  await check(`Invalid directory input is rejected: ${query}`, async () => {
    assert.equal((await read(`/api/politicians/directory${query}`)).status, 400);
  });
}
await check("Profile renders without private author fields", async () => {
  const response = await read("/alexandria-ocasio-cortez-new-york?period=all");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Alexandria Ocasio-Cortez/);
  assert.doesNotMatch(html, /submitted_by|published_by/);
});
for (const path of ["/federal", "/region/california", "/state/CA", "/leaderboard", "/races", "/sign-in", "/verify", "/about", "/faq", "/how-it-works", "/settings/notifications"]) {
  await check(`Public route renders: ${path}`, async () => {
    const response = await read(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /whytho\?/);
    assert.doesNotMatch(html, /Application error:|Something went wrong/);
  });
}
for (const path of ["/account", "/dashboard"]) {
  await check(`Signed-out access is gated: ${path}`, async () => {
    const response = await read(path);
    const html = await response.text();
    assert.match(`${response.headers.get("location") || ""} ${html}`, /sign-in/);
    assert.doesNotMatch(html, /published_by|submitted_by/);
  });
}
await check("Missing private attachment is unavailable and not cached", async () => {
  const response = await read("/api/answer-media/00000000-0000-4000-8000-000000000000");
  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control"), /no-store/);
});
const report = { origin, checkedAt: new Date().toISOString(), passed: results.filter((item) => item.passed).length, total: results.length, results };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.total) process.exitCode = 1;
