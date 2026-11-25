/**
 * Approved copy bank. Every text here was reviewed in docs/launch/SOCIAL_MARKETING_PLAN.md
 * or docs/launch/PROMOTION_PILOT_GO_LIVE.md. Tokens: {link} {verify_link} {questions} {officials} {as_of}.
 * Brand posts tag nobody, infer nothing about why a response is missing, and link only to whytho.us.
 */
import type { Channel } from "./types";

export interface AssetTemplate {
  code: string;
  name: string;
  text: string;
  /** Path on whytho.us the {link} token points to. */
  path: string;
  /** Checks a human must confirm before approving. */
  requires: string[];
}

export const ASSETS: Record<string, AssetTemplate> = {
  A1: {
    code: "A1",
    name: "Launch explainer",
    path: "/",
    requires: [],
    text: "What would you ask your representative if anyone could read the question and come back to see the answer? WhyTho gives public questions and official responses a place to be found. Ask one specific question: {link}",
  },
  A2a: {
    code: "A2a",
    name: "Question-writing tip: structure",
    path: "/",
    requires: [],
    text: "Make it answerable. Ask about one decision, one responsibility or one next step, and add a source when your question makes a factual claim. Try: what will your office do about an issue within its authority, and when can the public check progress? Ask on WhyTho: {link}",
  },
  A2b: {
    code: "A2b",
    name: "Question-writing tip: measure and timeline",
    path: "/",
    requires: [],
    text: "A good public question asks for the measure and the timeline. Which number will show the policy worked, and by when? Find the right official and ask in your own words: {link}",
  },
  A6: {
    code: "A6",
    name: "One-question prompt",
    path: "/",
    requires: [],
    text: "What is one question you want your representative to answer publicly? Make it specific, and check that the office is responsible for the issue. Ask it here: {link}",
  },
  A10: {
    code: "A10",
    name: "Office-team walkthrough",
    path: "/verify",
    requires: ["Confirm the claim and verification flow works on the live site before this posts"],
    text: "Working for an elected official or candidate? Your verified team can manage its WhyTho profile and publish answers. Start with the claim and verification process: {verify_link}",
  },
  WEEK_NOTE: {
    code: "WEEK_NOTE",
    name: "Weekly status note (counts verified, no inference)",
    path: "/",
    requires: [
      "Confirm the counts are audience activity, not founder or QA submissions (the generator cannot tell them apart)",
      "Counts must be refreshed within 24 hours of posting: npm run content:weekly -- --refresh",
    ],
    text: "This week on WhyTho: {questions} public questions were asked of {officials} officials. No official response is recorded on WhyTho as of {as_of}. A missing response here does not show whether an office has seen a question. Read the questions or add your own: {link}",
  },
};

export interface PreapprovedPost {
  date: string;
  hourUtc: number;
  channel: Channel;
  asset: string;
  text: string;
  approved_by: string;
  approved_at: string;
  notes: string;
}

/** Garrett approved these on November 23, 2026 (PROMOTION_PILOT_GO_LIVE.md). Exact copy, plain homepage link. */
export const PREAPPROVED: readonly PreapprovedPost[] = [
  {
    date: "2026-12-02",
    hourUtc: 16,
    channel: "x",
    asset: "PILOT-2",
    text: "A better housing question starts with something you can check. Try asking what measure an office would use to tell whether the new housing law makes rent more affordable. Find the right official and ask in your own words: https://whytho.us/",
    approved_by: "Garrett",
    approved_at: "2026-11-23",
    notes: "Approved in the first-week pilot. Check X Unsent posts first so it is not scheduled twice.",
  },
  {
    date: "2026-12-04",
    hourUtc: 16,
    channel: "x",
    asset: "PILOT-3",
    text: "Give a public official a question they can answer directly. Name one decision, ask about one result, and include a source if your question makes a factual claim. Find the right profile and ask on WhyTho: https://whytho.us/",
    approved_by: "Garrett",
    approved_at: "2026-11-23",
    notes: "Approved in the first-week pilot. Check X Unsent posts first so it is not scheduled twice.",
  },
];

/** Posts that went out before this job existed, so channel launches are not repeated. */
export const HISTORY: readonly { at: string; channel: Channel; asset: string; url: string; by: string }[] = [
  { at: "2026-11-23T19:50:00-06:00", channel: "x", asset: "A1", url: "https://x.com/WhyTho_official/status/2124953263078334794", by: "Garrett" },
];

/** US federal holidays with no scheduled posts. */
export const NO_POST_DATES = new Set(["2026-11-26", "2026-12-25", "2027-01-01"]);
