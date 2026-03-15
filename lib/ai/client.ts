import Anthropic from "@anthropic-ai/sdk";

// Singleton — lazily initialized so missing key throws at call time, not import time
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "FILL_IN") {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Set it in .env.local and Vercel environment variables."
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Model constants — locked decisions
export const MODEL_CLASSIFY = "claude-haiku-4-5-20251001"; // dedup, moderation
export const MODEL_GENERATE = "claude-sonnet-4-6";          // seeded questions, analysis
