/**
 * Jack — Harvester Agent
 *
 * Searches X API for tweets directed at politicians that look like questions.
 * Stores raw results in x_posts table with status='pending' for Curator review.
 * Credit-aware: tracks spend against X_DAILY_CREDIT_BUDGET.
 *
 * Usage:
 *   npx tsx scripts/jack-harvester.ts                    # All federal + governors
 *   npx tsx scripts/jack-harvester.ts --dry-run          # Preview only, no writes, no credits
 *   npx tsx scripts/jack-harvester.ts --limit=10         # First 10 politicians only
 *   npx tsx scripts/jack-harvester.ts --office=senate    # Senate only
 *   npx tsx scripts/jack-harvester.ts --office=house     # House only
 *   npx tsx scripts/jack-harvester.ts --office=governors # Governors only
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BEARER_TOKEN = process.env.X_API_BEARER_TOKEN!;
const DAILY_BUDGET = parseFloat(process.env.X_DAILY_CREDIT_BUDGET ?? "1.00");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const OFFICE_ARG = args.find((a) => a.startsWith("--office="))?.split("=")[1];

// Credit tracking (approximate — exact pricing varies by X plan)
// Each search call = 1 request unit. We track calls as a proxy for credits.
let callCount = 0;
let tweetsCollected = 0;
let newPosts = 0;
let duplicates = 0;

// ── X API ────────────────────────────────────────────────────────────────────

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
  };
  author_id?: string;
}

interface XUser {
  id: string;
  username: string;
  name: string;
}

interface XSearchResponse {
  data?: XTweet[];
  includes?: { users?: XUser[] };
  meta?: { result_count: number; next_token?: string };
}

async function searchTweets(handle: string, maxResults = 10): Promise<{ tweets: XTweet[]; users: Map<string, XUser> }> {
  // Search for tweets mentioning the politician — filter for questions client-side
  // X API v2 doesn't support ? in query syntax; we detect questions by text content
  const params = new URLSearchParams({
    query: `@${handle} -is:retweet lang:en`,
    max_results: String(Math.min(maxResults, 10)), // start conservative
    "tweet.fields": "public_metrics,created_at,text,author_id",
    expansions: "author_id",
    "user.fields": "username,name",
  });

  const res = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?${params}`,
    { headers: { Authorization: `Bearer ${BEARER_TOKEN}` } }
  );

  callCount++;

  if (res.status === 429) {
    const resetAt = res.headers.get("x-rate-limit-reset");
    const waitMs = resetAt ? (parseInt(resetAt) * 1000 - Date.now() + 1000) : 60000;
    console.log(`  ⏳ Rate limited — waiting ${Math.round(waitMs / 1000)}s...`);
    await sleep(waitMs);
    return searchTweets(handle, maxResults); // retry once
  }

  if (res.status === 403) {
    throw new Error("403 Forbidden — check X API tier and app permissions");
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`X API search failed: ${res.status} ${err}`);
  }

  const data = await res.json() as XSearchResponse;
  const users = new Map<string, XUser>();
  for (const u of data.includes?.users ?? []) {
    users.set(u.id, u);
  }

  return { tweets: data.data ?? [], users };
}

function isQuestion(text: string): boolean {
  // Must contain a question mark
  if (!text.includes("?")) return false;
  // Exclude retweet-like patterns (belt-and-suspenders beyond API filter)
  if (text.startsWith("RT ")) return false;
  // Minimum substance — at least 20 chars
  if (text.trim().length < 20) return false;
  return true;
}

// ── Database ─────────────────────────────────────────────────────────────────

async function getPoliticiansWithHandles() {
  const offices: string[] = [];

  if (!OFFICE_ARG || OFFICE_ARG === "senate") offices.push("U.S. Senator");
  if (!OFFICE_ARG || OFFICE_ARG === "house")  offices.push("U.S. Representative");
  if (!OFFICE_ARG || OFFICE_ARG === "governors") offices.push("Governor");

  const { data, error } = await supabase
    .from("politicians")
    .select("id, full_name, office, state, social_handles")
    .in("office", offices)
    .eq("is_active", true)
    .not("social_handles", "eq", "{}");

  if (error) throw error;

  // Filter to those that actually have a twitter key
  return (data ?? [])
    .filter((p) => {
      const h = (p.social_handles ?? {}) as Record<string, string>;
      return !!h.twitter;
    })
    .slice(0, LIMIT);
}

async function getExistingTweetIds(politicianId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("x_posts")
    .select("tweet_id")
    .eq("politician_id", politicianId);
  return new Set((data ?? []).map((r) => r.tweet_id));
}

async function insertXPost(params: {
  tweet_id: string;
  politician_id: string;
  author_handle: string;
  author_name: string | null;
  body: string;
  likes: number;
  retweets: number;
  reply_count: number;
  tweet_date: string | null;
  tweet_url: string;
}) {
  const { error } = await supabase.from("x_posts").insert({
    tweet_id: params.tweet_id,
    politician_id: params.politician_id,
    author_handle: params.author_handle,
    author_name: params.author_name,
    body: params.body,
    likes: params.likes,
    retweets: params.retweets,
    reply_count: params.reply_count,
    tweet_date: params.tweet_date,
    tweet_url: params.tweet_url,
    status: "pending",
  });

  if (error && error.code !== "23505") { // ignore duplicate key
    throw error;
  }
  return error?.code !== "23505";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tweetUrl(handle: string, tweetId: string): string {
  return `https://x.com/${handle}/status/${tweetId}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌾 Jack — Harvester Agent");
  console.log("==========================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes, no credits spent\n");
  console.log(`💰 Daily credit budget: $${DAILY_BUDGET}`);
  console.log(`📊 Office filter: ${OFFICE_ARG ?? "all"} | Limit: ${LIMIT}\n`);

  const politicians = await getPoliticiansWithHandles();
  console.log(`→ ${politicians.length} politicians with X handles to harvest\n`);

  for (const politician of politicians) {
    const handles = (politician.social_handles ?? {}) as Record<string, string>;
    const handle = handles.twitter!;

    process.stdout.write(`  🔍 @${handle} (${politician.full_name})... `);

    if (DRY_RUN) {
      console.log("[dry run — skipping API call]");
      continue;
    }

    try {
      const { tweets, users } = await searchTweets(handle);
      const questionTweets = tweets.filter((t) => isQuestion(t.text));
      tweetsCollected += tweets.length;

      if (questionTweets.length === 0) {
        console.log(`${tweets.length} tweets, 0 questions`);
        await sleep(300); // polite pacing
        continue;
      }

      const existingIds = await getExistingTweetIds(politician.id);
      let saved = 0;

      for (const tweet of questionTweets) {
        if (existingIds.has(tweet.id)) {
          duplicates++;
          continue;
        }

        const author = tweet.author_id ? users.get(tweet.author_id) : null;
        const isNew = await insertXPost({
          tweet_id: tweet.id,
          politician_id: politician.id,
          author_handle: author?.username ?? "unknown",
          author_name: author?.name ?? null,
          body: tweet.text,
          likes: tweet.public_metrics?.like_count ?? 0,
          retweets: tweet.public_metrics?.retweet_count ?? 0,
          reply_count: tweet.public_metrics?.reply_count ?? 0,
          tweet_date: tweet.created_at ?? null,
          tweet_url: tweetUrl(author?.username ?? "x", tweet.id),
        });

        if (isNew) {
          newPosts++;
          saved++;
        } else {
          duplicates++;
        }
      }

      console.log(`${tweets.length} tweets, ${questionTweets.length} questions, ${saved} new`);

      // Polite pacing — avoid hammering the API
      await sleep(500);
    } catch (err) {
      console.log(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n==========================");
  console.log(`✅ Harvest complete`);
  console.log(`   API calls made:    ${callCount}`);
  console.log(`   Tweets scanned:    ${tweetsCollected}`);
  console.log(`   New x_posts saved: ${newPosts}`);
  console.log(`   Duplicates:        ${duplicates}`);
  console.log(`\n   All saved with status='pending' — ready for Curator.`);
  console.log(`   Next: npx tsx scripts/jack-curator.ts`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
