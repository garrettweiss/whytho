import test from "node:test";
import assert from "node:assert/strict";
import { applyApprovals, buildWeeklyQueue, campaignLink, mergePrevious, renderQueueMarkdown } from "./queue";
import { validateItem } from "./rules";
import type { WeekFacts, WeeklyQueue } from "./types";

const facts: WeekFacts = { checked_at: "2026-11-25T22:00:00.000Z", week: 202648, user_questions_this_week: 11, officials_asked_this_week: 6, official_answers_total: 0, politicians_tracked: 11303 };
const site = "https://whytho.us";

test("campaign links identify the asset and channel only", () => {
  assert.equal(campaignLink(site, "/verify", "bluesky", 202648, "A10"), "https://whytho.us/verify?utm_source=bluesky&utm_campaign=2026w48-a10");
});

test("week 48 generated on Wednesday evening: launches on new channels, Thanksgiving skipped, Friday note", () => {
  const now = new Date("2026-11-25T22:43:00.000Z");
  const queue = buildWeeklyQueue({ week: 202648, now, site, facts });
  assert.equal(queue.label, "2026-W48");
  assert.equal(queue.monday, "2026-11-23");
  const summary = queue.items.map((item) => `${item.scheduled_at.slice(0, 10)} ${item.channel} ${item.asset}`);
  assert.deepEqual(summary, [
    "2026-11-25 x A10",
    "2026-11-25 bluesky A1",
    "2026-11-25 threads A1",
    "2026-11-27 x WEEK_NOTE",
    "2026-11-27 bluesky WEEK_NOTE",
    "2026-11-27 threads A6",
  ]);
  assert.ok(queue.items.every((item) => item.status === "draft"));
  assert.ok(queue.items.every((item) => validateItem(item).length === 0), queue.items.map((item) => validateItem(item)).flat().join("; "));
  const today = queue.items[0]!;
  assert.ok(new Date(today.scheduled_at).getTime() > now.getTime(), "a passed slot moves to the next quarter hour");
  assert.equal(queue.items.find((item) => item.asset === "WEEK_NOTE")!.text.includes("11 public questions were asked of 6 officials"), true);
  assert.ok(queue.items.map((item) => item.id).every((id, index) => id === `2026-W48-${String(index + 1).padStart(2, "0")}`));
});

test("week 49 carries Garrett's pre-approved pilot posts as approved and keeps the other channels in draft", () => {
  const queue = buildWeeklyQueue({ week: 202649, now: new Date("2026-11-29T14:00:00.000Z"), site, facts, launched: new Set(["x", "bluesky", "threads"]) });
  const wednesdayX = queue.items.find((item) => item.channel === "x" && item.scheduled_at.startsWith("2026-12-02"))!;
  assert.equal(wednesdayX.status, "approved");
  assert.equal(wednesdayX.asset, "PILOT-2");
  assert.equal(wednesdayX.approved_by, "Garrett");
  const fridayX = queue.items.find((item) => item.channel === "x" && item.scheduled_at.startsWith("2026-12-04"))!;
  assert.equal(fridayX.asset, "PILOT-3");
  assert.equal(queue.items.filter((item) => item.asset === "A1").length, 0, "no relaunch posts once channels have published");
  assert.ok(queue.items.filter((item) => item.channel === "threads").every((item) => item.status === "draft"));
  assert.equal(queue.items.filter((item) => item.channel === "threads").length, 2);
});

test("regeneration keeps approvals and publications, and re-opens a note whose counts changed", () => {
  const now = new Date("2026-11-25T22:43:00.000Z");
  const first = buildWeeklyQueue({ week: 202648, now, site, facts });
  const approved = applyApprovals(first, ["2026-W48-01", "2026-W48-04"], "Garrett", now);
  assert.deepEqual(approved.blocked, []);
  first.items[1]!.status = "published";
  first.items[1]!.published = { at: "2026-11-25T23:00:00.000Z", url: "https://bsky.app/profile/whytho/post/1", by: "content-publish" };
  const second = buildWeeklyQueue({ week: 202648, now: new Date("2026-11-27T15:00:00.000Z"), site, facts: { ...facts, user_questions_this_week: 14, checked_at: "2026-11-27T15:00:00.000Z" }, previous: first });
  const byId = new Map(second.items.map((item) => [item.id, item]));
  assert.equal(byId.get("2026-W48-01")!.status, "approved", "a passed approved item is kept");
  assert.equal(byId.get("2026-W48-02")!.status, "published");
  const note = byId.get("2026-W48-04")!;
  assert.equal(note.status, "draft", "changed counts need a fresh approval");
  assert.ok(note.text.includes("14 public questions"));
  assert.ok(note.notes?.includes("re-approve"));
});

test("approval refuses items that break the rules", () => {
  const queue: WeeklyQueue = buildWeeklyQueue({ week: 202648, now: new Date("2026-11-25T22:43:00.000Z"), site, facts });
  queue.items[0]!.text = "Hey @someone look at this https://whytho.us/";
  const result = applyApprovals(queue, [queue.items[0]!.id, "nope"], "Garrett", new Date());
  assert.deepEqual(result.approved, []);
  assert.equal(result.blocked.length, 2);
  assert.equal(queue.items[0]!.status, "draft");
});

test("review sheet lists every item with its count and checks", () => {
  const queue = buildWeeklyQueue({ week: 202648, now: new Date("2026-11-25T22:43:00.000Z"), site, facts });
  queue.link_checks = { [queue.items[0]!.links[0]!]: 200 };
  const md = renderQueueMarkdown(queue);
  assert.ok(md.includes("# Content queue 2026-W48"));
  assert.ok(md.includes("2026-W48-01 · x · A10"));
  assert.ok(md.includes("→ 200"));
  assert.ok(md.includes("- [ ] Confirm the counts are audience activity"));
  assert.ok(!md.includes("—"));
  assert.equal(mergePrevious(queue.items, null), queue.items);
});

test("ids never collide across regenerations", () => {
  const first = buildWeeklyQueue({ week: 202648, now: new Date("2026-11-25T22:43:00.000Z"), site, facts });
  first.items[0]!.status = "published";
  const second = buildWeeklyQueue({ week: 202648, now: new Date("2026-11-27T15:00:00.000Z"), site, facts, previous: first });
  const ids = second.items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("2026-W48-01"));
  assert.deepEqual(second.items.filter((item) => item.scheduled_at.startsWith("2026-11-27")).map((item) => item.id), ["2026-W48-04", "2026-W48-05", "2026-W48-06"]);
});
