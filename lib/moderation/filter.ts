/**
 * Content moderation utilities for WhyTho question submissions.
 *
 * Two layers:
 *   1. Profanity filter — synchronous, runs on every submission
 *   2. Spam detection  — threshold constants for per-user/per-politician rate limiting
 *      (DB query runs in the questions route; this module provides the logic)
 */

import { Filter } from "bad-words";

// ── Profanity filter ──────────────────────────────────────────────────────────

// Custom additions beyond the bad-words defaults
const CUSTOM_WORDS: string[] = [
  // Add domain-specific terms here as needed
];

const filter = new Filter();
if (CUSTOM_WORDS.length > 0) {
  filter.addWords(...CUSTOM_WORDS);
}

/**
 * Returns true if the text contains profanity.
 */
export function containsProfanity(text: string): boolean {
  try {
    return filter.isProfane(text);
  } catch {
    // bad-words can throw on edge cases — default to clean
    return false;
  }
}

// ── Spam detection ────────────────────────────────────────────────────────────

/** Max questions one user can submit to the same politician in SPAM_WINDOW_HOURS */
export const SPAM_SAME_POLITICIAN_LIMIT = 3;

/** Window for spam detection (hours) */
export const SPAM_WINDOW_HOURS = 24;

/**
 * Given a count of recent submissions by this user to this politician,
 * returns true if they've hit the spam threshold.
 */
export function exceedsSpamThreshold(recentCount: number): boolean {
  return recentCount >= SPAM_SAME_POLITICIAN_LIMIT;
}
