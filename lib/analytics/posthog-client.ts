"use client";

/**
 * Product analytics are paused for launch until a reviewed consent flow exists.
 * In a civic product, profile views and votes can reveal political interests.
 * Keep system health telemetry independent in posthog-server.ts.
 */
export function initPostHog() { /* Deliberately no browser analytics initialization. */ }
export function trackQuestionSubmitted(_politicianId: string) { void _politicianId; }
export function trackVote(_politicianId: string, _questionId: string, _value: number) { void _politicianId; void _questionId; void _value; }
export function trackProfileClaimed(_politicianId: string) { void _politicianId; }
export function trackAnswerPublished(_politicianId: string, _answerType: string) { void _politicianId; void _answerType; }
export function trackUserRegistered(_method: "google" | "magic_link" | "anonymous") { void _method; }
