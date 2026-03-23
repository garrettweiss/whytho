"use client";

/**
 * PostHog browser client.
 * Import this only in client components.
 */

import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) return;
  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: false, // We fire manually on route change
    capture_pageleave: true,
  });
  initialized = true;
}

export { posthog };

// ── Typed event helpers ───────────────────────────────────────────────────────

export function trackQuestionSubmitted(politicianId: string) {
  posthog.capture("question_submitted", { politician_id: politicianId });
}

export function trackVote(politicianId: string, questionId: string, value: number) {
  posthog.capture("vote_cast", { politician_id: politicianId, question_id: questionId, value });
}

export function trackProfileClaimed(politicianId: string) {
  posthog.capture("profile_claimed", { politician_id: politicianId });
}

export function trackAnswerPublished(politicianId: string, answerType: string) {
  posthog.capture("answer_published", { politician_id: politicianId, answer_type: answerType });
}

export function trackUserRegistered(method: "google" | "magic_link" | "anonymous") {
  posthog.capture("user_registered", { method });
}
