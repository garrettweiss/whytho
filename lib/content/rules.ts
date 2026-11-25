/**
 * Editorial and platform rules for brand posts.
 * Source: docs/launch/SOCIAL_MARKETING_PLAN.md and CLAUDE.md writing rules.
 */
import type { Channel, QueueItem } from "./types";

export const LIMITS: Record<Channel, number> = { x: 280, bluesky: 300, threads: 500 };

/** X counts every link as 23 characters regardless of length. */
const X_LINK_WEIGHT = 23;

export const ALLOWED_LINK_HOSTS = new Set(["whytho.us", "www.whytho.us"]);

/** The plan forbids inferring intent from a missing response. */
export const BANNED_PHRASES = ["ignored", "refused", "afraid to answer", "shame", "coward", "dodged", "hiding"];

const URL_PATTERN = /https?:\/\/[^\s)]+/g;
const MENTION_PATTERN = /(^|[\s(])@[A-Za-z0-9_.]+/;
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

export function extractLinks(text: string): string[] {
  return [...text.matchAll(URL_PATTERN)].map((match) => match[0]);
}

/** Bluesky shows "whytho.us/path" while the facet carries the full campaign URL. */
export function displayLink(url: string): string {
  try { const parsed = new URL(url); return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`; } catch { return url; }
}

export function measure(channel: Channel, text: string): number {
  if (channel === "x") {
    const replaced = text.replace(URL_PATTERN, "x".repeat(X_LINK_WEIGHT));
    return [...replaced].length;
  }
  if (channel === "bluesky") {
    const shown = text.replace(URL_PATTERN, (url) => displayLink(url));
    return segmenter ? [...segmenter.segment(shown)].length : [...shown].length;
  }
  return [...text].length;
}

export function validateText(channel: Channel, text: string): string[] {
  const problems: string[] = [];
  if (!text.trim()) problems.push("empty text");
  if (text.includes("—")) problems.push("contains an em dash");
  if (MENTION_PATTERN.test(text)) problems.push("contains an @mention; brand posts tag nobody");
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`).test(lower)) problems.push(`uses banned phrase "${phrase}"`);
  }
  const length = measure(channel, text);
  if (length > LIMITS[channel]) problems.push(`${length} characters exceeds the ${channel} limit of ${LIMITS[channel]}`);
  for (const link of extractLinks(text)) {
    let host: string | null = null;
    try { const url = new URL(link); host = url.protocol === "https:" ? url.hostname : null; } catch { host = null; }
    if (!host || !ALLOWED_LINK_HOSTS.has(host)) problems.push(`link ${link} is not an https whytho.us link`);
  }
  return problems;
}

/** Status posts about missing responses must carry a fresh timestamp. */
/** Sample of the publish-time stamp so lengths are checked against real output. */
export const AS_OF_SAMPLE = "Nov 27, 2026, 16:00 UTC";

export function validateItem(item: QueueItem): string[] {
  const problems = validateText(item.channel, item.text.replace(/\{as_of\}/g, AS_OF_SAMPLE));
  if ((item.asset === "A9" || item.asset === "WEEK_NOTE") && !/\bas of\b/i.test(item.text)) {
    problems.push("status post lacks an \"as of\" timestamp");
  }
  for (const link of item.links) {
    if (!item.text.includes(link)) problems.push(`declared link ${link} is missing from the text`);
  }
  return problems;
}
