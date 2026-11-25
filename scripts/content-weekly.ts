/**
 * Weekly content job: builds the approval queue for one ISO week.
 *
 * Writes content/queue/<label>.json (machine) and content/queue/<label>.md (review sheet).
 * Nothing is posted here. Approval and publishing live in scripts/content-publish.ts.
 *
 * Usage:
 *   npx tsx scripts/content-weekly.ts                 # current week
 *   npx tsx scripts/content-weekly.ts --next          # upcoming week (the Sunday job)
 *   npx tsx scripts/content-weekly.ts --week=2026-W49
 *   npx tsx scripts/content-weekly.ts --refresh       # re-pull facts and link checks for an existing queue
 *   npx tsx scripts/content-weekly.ts --next --label-only
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildWeeklyQueue, renderQueueMarkdown } from "../lib/content/queue";
import { checkLinks, loadWeekFacts } from "../lib/content/facts";
import { validateItem } from "../lib/content/rules";
import type { WeeklyQueue } from "../lib/content/types";
import { isoWeekOf, nextWeek, parseWeekArg, weekLabel } from "../lib/content/week";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const now = new Date();
const requested = parseWeekArg(option("week"));
if (option("week") && !requested) { console.error("Bad --week. Use 2026-W49 or 202649."); process.exit(2); }
const week = requested ?? (flag("next") ? nextWeek(isoWeekOf(now)) : isoWeekOf(now));
const label = weekLabel(week);
if (flag("label-only")) { console.log(label); process.exit(0); }

const rawSite = process.env.NEXT_PUBLIC_SITE_URL ?? "";
const SITE = !rawSite || rawSite.includes("localhost") ? "https://whytho.us" : rawSite;
const OUT_DIR = option("out") ?? path.join("content", "queue");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const client = createClient<Database>(url, key, { auth: { persistSession: false } });

  console.log(`📰 Content queue ${label}`);
  console.log("====================");
  const jsonPath = path.join(OUT_DIR, `${label}.json`);
  const mdPath = path.join(OUT_DIR, `${label}.md`);
  const previous: WeeklyQueue | null = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) as WeeklyQueue : null;
  if (previous) console.log(`→ Merging with existing ${jsonPath} (${previous.items.length} items)`);

  const facts = await loadWeekFacts(client, week, now);
  console.log(`→ Facts: ${facts.user_questions_this_week} user questions this week, ${facts.officials_asked_this_week} officials, ${facts.official_answers_total} official answers all time, ${facts.politicians_tracked} politicians tracked`);

  const queue = buildWeeklyQueue({ week, now, site: SITE, facts, previous });
  const links = queue.items.filter((item) => item.status !== "published").flatMap((item) => item.links);
  queue.link_checks = { ...queue.link_checks, ...(await checkLinks(links)) };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(queue, null, 2) + "\n");
  fs.writeFileSync(mdPath, renderQueueMarkdown(queue));

  console.log(`\n→ ${queue.items.length} items for ${queue.monday} to ${queue.sunday}:`);
  for (const item of queue.items) {
    const problems = validateItem(item);
    const link = item.links[0] ? ` ${queue.link_checks[item.links[0]] ?? "?"}` : "";
    console.log(`  ${item.id}  ${item.scheduled_at.slice(0, 16)}Z  ${item.channel.padEnd(7)} ${item.asset.padEnd(9)} ${item.status.padEnd(9)}${link}${problems.length ? `  ⚠ ${problems.join("; ")}` : ""}`);
  }
  const unreachable = Object.entries(queue.link_checks).filter(([, status]) => status !== 200);
  if (unreachable.length) console.log(`\n⚠ Links not returning 200: ${unreachable.map(([l, s]) => `${l} (${s})`).join(", ")}`);
  console.log(`\nWrote ${jsonPath}\nWrote ${mdPath}`);
  console.log(`\nNext: review ${mdPath}, then npm run content:publish -- --week=${label} --approve=ID,ID`);
}

main().catch((err) => { console.error("❌", err instanceof Error ? err.message : err); process.exit(1); });
