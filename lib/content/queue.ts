/** Builds the weekly queue from the approved copy bank and the week's facts, and renders the review sheet. */
import { ASSETS, HISTORY, NO_POST_DATES, PREAPPROVED } from "./assets";
import { extractLinks, measure, LIMITS, validateItem } from "./rules";
import type { Channel, ItemStatus, QueueItem, WeekFacts, WeeklyQueue } from "./types";
import { CHANNELS } from "./types";
import { isoDate, mondayOf, slot, weekLabel } from "./week";

export const POST_HOUR_UTC = 16;

export interface BuildInput {
  week: number;
  now: Date;
  site: string;
  facts: WeekFacts;
  /** Items from an earlier generation of the same week; their statuses and edits survive. */
  previous?: WeeklyQueue | null;
  /** Channels that have ever published (from history and previous queues). */
  launched?: ReadonlySet<Channel>;
}

export function campaignLink(site: string, path: string, channel: Channel, week: number, asset: string): string {
  const url = new URL(path, site);
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_campaign", `${weekLabel(week).toLowerCase().replace("-", "")}-${asset.toLowerCase()}`);
  return url.toString();
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token);
}

function assetFor(channel: Channel, dayIndex: number, week: number, launched: ReadonlySet<Channel>): string | null {
  if (!launched.has(channel)) return "A1";
  const even = week % 2 === 0;
  if (channel === "threads") {
    if (dayIndex === 0) return even ? "A2a" : "A2b";
    if (dayIndex === 4) return "A6";
    return null;
  }
  if (dayIndex === 0) return even ? "A2a" : "A2b";
  if (dayIndex === 2) return even ? "A10" : "A2b";
  if (dayIndex === 4) return "WEEK_NOTE";
  return null;
}

/** Template: Monday tip, Wednesday feature, Friday status note (Threads gets a prompt), all 16:00 UTC. */
export function buildWeeklyQueue(input: BuildInput): WeeklyQueue {
  const { week, now, site, facts } = input;
  const launched = new Set<Channel>(input.launched ?? []);
  for (const past of HISTORY) launched.add(past.channel);
  for (const item of input.previous?.items ?? []) if (item.status === "published") launched.add(item.channel);

  const monday = mondayOf(week);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const items: QueueItem[] = [];
  const firstForChannel = new Set<Channel>();

  for (const dayIndex of [0, 2, 4]) {
    const dayDate = isoDate(new Date(slot(week, dayIndex, 0)));
    if (NO_POST_DATES.has(dayDate)) continue;
    for (const channel of CHANNELS) {
      const preapproved = PREAPPROVED.find((post) => post.channel === channel && post.date === dayDate);
      let scheduled = slot(week, dayIndex, POST_HOUR_UTC);
      if (new Date(scheduled).getTime() < now.getTime()) {
        const endOfDay = new Date(slot(week, dayIndex, 23, 30));
        if (endOfDay.getTime() < now.getTime()) continue;
        const soon = new Date(Math.ceil((now.getTime() + 15 * 60_000) / (15 * 60_000)) * 15 * 60_000);
        scheduled = soon.toISOString();
      }
      if (preapproved) {
        items.push({
          id: "", asset: preapproved.asset, channel, scheduled_at: slot(week, dayIndex, preapproved.hourUtc),
          text: preapproved.text, links: extractLinks(preapproved.text), status: "approved", requires: [],
          notes: preapproved.notes, approved_by: preapproved.approved_by, approved_at: preapproved.approved_at,
        });
        continue;
      }
      let code = assetFor(channel, dayIndex, week, launched);
      if (code === "A1" && firstForChannel.has(channel)) code = assetFor(channel, dayIndex, week, new Set([...launched, channel]));
      if (!code) continue;
      if (code === "A1") firstForChannel.add(channel);
      const asset = ASSETS[code];
      if (!asset) throw new Error(`Unknown asset ${code}`);
      const link = campaignLink(site, asset.path, channel, week, code);
      const text = fillTemplate(asset.text, {
        link, verify_link: link,
        questions: String(facts.user_questions_this_week),
        officials: String(facts.officials_asked_this_week),
      });
      items.push({ id: "", asset: code, channel, scheduled_at: scheduled, text, links: extractLinks(text), status: "draft", requires: [...asset.requires] });
    }
  }

  items.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel));
  const label = weekLabel(week);
  const merged = assignIds(mergePrevious(items, input.previous), label);
  return {
    version: 1, week, label, monday: isoDate(monday), sunday: isoDate(sunday),
    generated_at: now.toISOString(), site, facts, link_checks: input.previous?.link_checks ?? {}, items: merged,
  };
}

/** Ids never change once issued: matched items keep theirs, new items continue the numbering. */
export function assignIds(items: QueueItem[], label: string): QueueItem[] {
  let next = items.reduce((max, item) => {
    const match = /-(\d+)$/.exec(item.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  for (const item of items) if (!item.id) item.id = `${label}-${String(++next).padStart(2, "0")}`;
  return items;
}

/** Same asset+channel+day keeps its id, status, approval, publication and any hand-edited text. */
export function mergePrevious(items: QueueItem[], previous?: WeeklyQueue | null): QueueItem[] {
  if (!previous) return items;
  const key = (item: QueueItem) => `${item.channel}|${item.asset}|${item.scheduled_at.slice(0, 10)}`;
  const earlier = new Map(previous.items.map((item) => [key(item), item]));
  const kept = new Set<string>();
  const merged = items.map((item) => {
    const old = earlier.get(key(item));
    if (!old) return item;
    kept.add(key(old));
    if (old.status === "draft" || old.status === "skipped") return { ...item, id: old.id, status: old.status, notes: old.notes ?? item.notes };
    const textChanged = old.asset === "WEEK_NOTE" && old.status === "approved" && old.text !== item.text;
    return {
      ...item,
      text: old.status === "published" || !textChanged ? old.text : item.text,
      status: textChanged ? "draft" as ItemStatus : old.status,
      notes: textChanged ? `Counts changed after approval; re-approve. ${old.notes ?? ""}`.trim() : old.notes,
      approved_by: textChanged ? undefined : old.approved_by,
      approved_at: textChanged ? undefined : old.approved_at,
      published: old.published, error: old.error, id: old.id,
    };
  });
  for (const old of previous.items) {
    if (!kept.has(key(old)) && (old.status === "published" || old.status === "approved" || old.status === "failed")) merged.push(old);
  }
  merged.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel));
  return merged;
}

export function applyApprovals(queue: WeeklyQueue, ids: readonly string[], by: string, at: Date): { approved: string[]; blocked: string[] } {
  const approved: string[] = [];
  const blocked: string[] = [];
  for (const id of ids) {
    const item = queue.items.find((candidate) => candidate.id === id);
    if (!item) { blocked.push(`${id}: not in queue`); continue; }
    if (item.status === "published") { blocked.push(`${id}: already published`); continue; }
    const problems = validateItem(item);
    if (problems.length) { blocked.push(`${id}: ${problems.join("; ")}`); continue; }
    item.status = "approved"; item.approved_by = by; item.approved_at = at.toISOString(); item.error = undefined;
    approved.push(id);
  }
  return { approved, blocked };
}

const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", hour12: false });

export function renderQueueMarkdown(queue: WeeklyQueue): string {
  const lines: string[] = [];
  lines.push(`# Content queue ${queue.label} (${queue.monday} to ${queue.sunday})`);
  lines.push("");
  lines.push(`Generated ${queue.generated_at}. Nothing here posts until Garrett approves it. Approve with \`npm run content:publish -- --week=${queue.label} --approve=ID,ID\`, then publish with \`--go-live\`. All times UTC; 16:00 UTC is 8 a.m. Pacific.`);
  lines.push("");
  lines.push("## Facts used (verify before approving the status note)");
  lines.push("");
  lines.push(`| Fact | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Checked at | ${queue.facts.checked_at} |`);
  lines.push(`| User questions this week (non-test, non-seeded, source user) | ${queue.facts.user_questions_this_week} |`);
  lines.push(`| Officials asked this week | ${queue.facts.officials_asked_this_week} |`);
  lines.push(`| Official answers recorded, all time | ${queue.facts.official_answers_total} |`);
  lines.push(`| Politicians tracked | ${queue.facts.politicians_tracked} |`);
  lines.push("");
  lines.push("## Posts");
  lines.push("");
  for (const item of queue.items) {
    const problems = validateItem(item);
    const when = dayFormatter.format(new Date(item.scheduled_at));
    lines.push(`### ${item.id} · ${item.channel} · ${item.asset} · ${when} UTC · ${item.status.toUpperCase()}`);
    lines.push("");
    lines.push(`> ${item.text.replace(/\n/g, "\n> ")}`);
    lines.push("");
    lines.push(`${measure(item.channel, item.text)} / ${LIMITS[item.channel]} characters.`);
    for (const link of item.links) {
      const status = queue.link_checks[link];
      lines.push(`Link check: ${link} → ${status === undefined ? "not checked" : status === null ? "UNREACHABLE" : status}`);
    }
    if (item.requires.length) { lines.push(""); lines.push("Before approving:"); for (const check of item.requires) lines.push(`- [ ] ${check}`); }
    if (item.notes) { lines.push(""); lines.push(`Note: ${item.notes}`); }
    if (problems.length) { lines.push(""); lines.push(`Blocked: ${problems.join("; ")}`); }
    if (item.approved_by) lines.push(`Approved by ${item.approved_by} on ${item.approved_at ?? "?"}.`);
    if (item.published) lines.push(`Published ${item.published.at}${item.published.url ? ` → ${item.published.url}` : ""}.`);
    if (item.error) lines.push(`Error: ${item.error}`);
    lines.push("");
  }
  lines.push("## Rules applied");
  lines.push("");
  lines.push("- No @mentions, no paid spend, no DMs, no automated outreach. Standalone brand posts only.");
  lines.push("- Missing responses are stated with a timestamp and never explained. Banned words: ignored, refused, afraid to answer, shame.");
  lines.push("- Links go only to whytho.us and are re-checked at publish time.");
  lines.push("- Seeded and imported questions are never counted as new users.");
  lines.push("");
  return lines.join("\n");
}
