/**
 * Approve and publish items from a weekly content queue.
 *
 * Dry run is the default. Nothing reaches a platform without --go-live, and only items Garrett approved.
 *
 * Usage:
 *   npx tsx scripts/content-publish.ts --week=2026-W48                       # dry run of approved, due items
 *   npx tsx scripts/content-publish.ts --week=2026-W48 --approve=2026-W48-01,2026-W48-02 --by=Garrett
 *   npx tsx scripts/content-publish.ts --week=2026-W48 --skip=2026-W48-05 --reason="hold"
 *   npx tsx scripts/content-publish.ts --week=2026-W48 --go-live             # post approved items that are due
 *   npx tsx scripts/content-publish.ts --week=2026-W48 --go-live --include-future
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import * as fs from "node:fs";
import * as path from "node:path";
import { applyApprovals, renderQueueMarkdown } from "../lib/content/queue";
import { checkLinks } from "../lib/content/facts";
import { validateItem } from "../lib/content/rules";
import type { Channel, QueueItem, WeeklyQueue } from "../lib/content/types";
import { isoWeekOf, parseWeekArg, weekLabel } from "../lib/content/week";
import { postToX, xCredentialsFromEnv } from "../lib/content/publishers/x";
import { blueskyCredentialsFromEnv, postToBluesky } from "../lib/content/publishers/bluesky";
import { postToThreads, threadsCredentialsFromEnv } from "../lib/content/publishers/threads";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const GO_LIVE = flag("go-live");
const INCLUDE_FUTURE = flag("include-future");
const DUE_WINDOW_MS = 10 * 60_000;
const QUEUE_DIR = option("dir") ?? path.join("content", "queue");
const LOG_PATH = path.join("content", "published.jsonl");

const asOfDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const asOfTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
/** "Nov 27, 2026, 16:00 UTC", the same shape rules.ts measures against. */
export function formatAsOf(date: Date): string {
  return `${asOfDate.format(date)}, ${asOfTime.format(date)} UTC`;
}

function save(queue: WeeklyQueue, label: string) {
  fs.writeFileSync(path.join(QUEUE_DIR, `${label}.json`), JSON.stringify(queue, null, 2) + "\n");
  fs.writeFileSync(path.join(QUEUE_DIR, `${label}.md`), renderQueueMarkdown(queue));
}

async function publish(item: QueueItem, text: string): Promise<{ id: string; url: string }> {
  const channel: Channel = item.channel;
  if (channel === "x") { const creds = xCredentialsFromEnv(); if (!creds) throw new Error("missing X credentials"); return postToX(text, creds); }
  if (channel === "bluesky") { const creds = blueskyCredentialsFromEnv(); if (!creds) throw new Error("missing BLUESKY_HANDLE / BLUESKY_APP_PASSWORD"); return postToBluesky(text, creds); }
  const creds = threadsCredentialsFromEnv(); if (!creds) throw new Error("missing THREADS_USER_ID / THREADS_ACCESS_TOKEN"); return postToThreads(text, creds);
}

function credentialsPresent(channel: Channel): boolean {
  return channel === "x" ? !!xCredentialsFromEnv() : channel === "bluesky" ? !!blueskyCredentialsFromEnv() : !!threadsCredentialsFromEnv();
}

async function main() {
  const now = new Date();
  const week = parseWeekArg(option("week")) ?? isoWeekOf(now);
  const label = weekLabel(week);
  const jsonPath = path.join(QUEUE_DIR, `${label}.json`);
  if (!fs.existsSync(jsonPath)) throw new Error(`No queue at ${jsonPath}. Run: npm run content:weekly -- --week=${label}`);
  const queue = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as WeeklyQueue;

  console.log(`📤 Content publish ${label}`);
  console.log("======================");
  console.log(GO_LIVE ? "🚨 GO LIVE: approved, due items will be posted" : "🔍 DRY RUN: nothing will be posted\n");

  const approveIds = option("approve")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (approveIds.length) {
    const by = option("by") ?? "Garrett";
    const result = applyApprovals(queue, approveIds, by, now);
    for (const id of result.approved) console.log(`  ✅ approved ${id} (by ${by})`);
    for (const why of result.blocked) console.log(`  ⛔ not approved: ${why}`);
    save(queue, label);
  }
  const skipIds = option("skip")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (skipIds.length) {
    for (const id of skipIds) {
      const item = queue.items.find((candidate) => candidate.id === id);
      if (!item || item.status === "published") { console.log(`  ⛔ cannot skip ${id}`); continue; }
      item.status = "skipped"; item.notes = [item.notes, `Skipped: ${option("reason") ?? "no reason given"}`].filter(Boolean).join(" ");
      console.log(`  ⏭️  skipped ${id}`);
    }
    save(queue, label);
  }

  const approved = queue.items.filter((item) => item.status === "approved");
  const due = approved.filter((item) => INCLUDE_FUTURE || new Date(item.scheduled_at).getTime() <= now.getTime() + DUE_WINDOW_MS);
  const waiting = approved.length - due.length;
  console.log(`\n→ ${queue.items.length} items | ${approved.length} approved | ${due.length} due now${waiting ? ` | ${waiting} approved for later` : ""}`);
  const drafts = queue.items.filter((item) => item.status === "draft");
  if (drafts.length) console.log(`→ ${drafts.length} still draft: ${drafts.map((item) => item.id).join(", ")}`);
  if (!due.length) { console.log("\nNothing due. Done."); return; }

  const linkChecks = await checkLinks(due.flatMap((item) => item.links));
  let posted = 0, failed = 0, held = 0;
  for (const item of due) {
    const text = item.text.replace(/\{as_of\}/g, formatAsOf(now));
    const problems = validateItem({ ...item, text });
    for (const link of item.links) if (linkChecks[link] !== 200) problems.push(`link ${link} returned ${linkChecks[link] ?? "no response"}`);
    if (item.asset === "WEEK_NOTE") {
      const ageHours = (now.getTime() - new Date(queue.facts.checked_at).getTime()) / 3_600_000;
      if (ageHours > 24) problems.push(`counts are ${ageHours.toFixed(0)}h old; run npm run content:weekly -- --week=${label} --refresh and re-approve`);
    }
    if (!credentialsPresent(item.channel)) problems.push(`no ${item.channel} credentials in .env.local`);

    console.log(`\n  ${item.id} · ${item.channel} · ${item.asset} · due ${item.scheduled_at}`);
    if (item.notes) console.log(`     note: ${item.notes}`);
    console.log(`     "${text}"`);
    if (problems.length) { console.log(`     ⛔ held: ${problems.join("; ")}`); held++; continue; }
    if (!GO_LIVE) { console.log("     [dry run: would post]"); continue; }

    try {
      const result = await publish(item, text);
      item.status = "published"; item.error = undefined;
      item.published = { at: new Date().toISOString(), url: result.url, id: result.id, by: "content-publish" };
      fs.appendFileSync(LOG_PATH, JSON.stringify({ at: item.published.at, week: label, id: item.id, channel: item.channel, asset: item.asset, url: result.url, text }) + "\n");
      console.log(`     ✅ posted ${result.url}`);
      posted++;
    } catch (err) {
      item.status = "failed"; item.error = err instanceof Error ? err.message : String(err);
      console.log(`     ❌ ${item.error}`);
      failed++;
    }
    save(queue, label);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n======================");
  console.log(GO_LIVE ? `Posted ${posted}, failed ${failed}, held ${held}.` : `Dry run complete. ${due.length - held} would post, ${held} held.`);
  if (!GO_LIVE && due.length - held > 0) console.log(`Garrett's go-live instruction, then: npm run content:publish -- --week=${label} --go-live`);
}

main().catch((err) => { console.error("❌", err instanceof Error ? err.message : err); process.exit(1); });
