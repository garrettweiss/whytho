/**
 * Content moderation utilities for WhyTho question submissions.
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
