/**
 * Jack — Herald Agent
 *
 * Notifies constituents from @WhyTho_official that their question is live.
 *
 * Posts a standalone mention tweet (NOT a reply) to avoid X's restriction
 * that blocks replies from accounts not previously engaged with by the author.
 * A mention tweet lands in the user's notifications identically to a reply.
 *
 * For each published x_post with no outreach log entry:
 *   1. Build tweet: "@handle Your question is now live on WhyTho → [link]"
 *   2. POST /2/tweets (no in_reply_to_tweet_id — standalone mention)
 *   3. Log to x_outreach_log
 *   4. Update x_posts.status = 'notified'
 *
 * Uses OAuth 1.0a User Context (required for write operations).
 * Rate limit: 1 tweet per post, 2s delay between posts.
 *
 * Usage:
 *   npx tsx scripts/jack-herald.ts                 # All published, unnotified
 *   npx tsx scripts/jack-herald.ts --dry-run       # Preview only, no writes
 *   npx tsx scripts/jack-herald.ts --limit=10      # First N posts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONSUMER_KEY    = process.env.X_API_KEY!;
const CONSUMER_SECRET = process.env.X_API_SECRET!;
const ACCESS_TOKEN    = process.env.X_ACCESS_TOKEN!;
const ACCESS_SECRET   = process.env.X_ACCESS_TOKEN_SECRET!;
// Always use production URL for outbound tweets — localhost is dev-only
const rawSiteUrl      = process.env.NEXT_PUBLIC_SITE_URL ?? "";
const SITE_URL        = rawSiteUrl.includes("localhost") ? "https://whytho.us" : (rawSiteUrl || "https://whytho.us");

const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT   = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "9999");

// ── OAuth 1.0a ────────────────────────────────────────────────────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21").replace(/'/g, "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function buildOAuthHeader(method: string, url: string, extraParams: Record<string, string> = {}): string {
  const nonce     = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     CONSUMER_KEY,
    oauth_nonce:            nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        timestamp,
    oauth_token:            ACCESS_TOKEN,
    oauth_version:          "1.0",
  };

  // Combine all params for signature (oauth + query/body)
  const allParams = { ...oauthParams, ...extraParams };

  // Sort and encode
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k] ?? "")}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(CONSUMER_SECRET)}&${percentEncode(ACCESS_SECRET)}`;
  const signature  = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  oauthParams.oauth_signature = signature;

  const headerValue = "OAuth " + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k] ?? "")}"`)
    .join(", ");

  return headerValue;
}

// ── Post tweet (standalone mention — NOT a reply) ─────────────────────────────
// X blocks replies from accounts not previously engaged with by the author.
// A standalone @mention delivers to their notifications identically.

interface TweetResponse {
  data?: { id: string; text: string };
  errors?: Array<{ message: string }>;
}

async function postMention(mentionText: string): Promise<string> {
  const url  = "https://api.twitter.com/2/tweets";
  const body = JSON.stringify({
    text: mentionText,
    // No `reply` field — standalone tweet, not a reply thread
  });

  const auth = buildOAuthHeader("POST", url);

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:  auth,
      "Content-Type": "application/json",
    },
    body,
  });

  const rawText = await res.text();

  if (!res.ok) {
    // Try to parse as JSON for structured error, fall back to raw text
    let msg = `HTTP ${res.status}`;
    try {
      const errJson = JSON.parse(rawText) as { errors?: Array<{ message: string }>; detail?: string; title?: string };
      msg = errJson.errors?.[0]?.message ?? errJson.detail ?? errJson.title ?? msg;
    } catch { /* use raw text */ }
    throw new Error(`X API error: ${msg} — raw: ${rawText.slice(0, 300)}`);
  }

  const json = JSON.parse(rawText) as TweetResponse;
  if (json.errors) {
    throw new Error(`X API error: ${json.errors[0]?.message ?? "Unknown error"}`);
  }

  return json.data!.id;
}

// ── Build reply text ──────────────────────────────────────────────────────────

function buildReplyText(authorHandle: string, politicianSlug: string, questionId: string): string {
  const url = `${SITE_URL}/${politicianSlug}`;
  // Stay under 280 chars
  return `@${authorHandle} Your question is now live on WhyTho — vote it up to demand a response 👇\n${url}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📣 Jack — Herald Agent");
  console.log("======================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no tweets will be sent\n");
  console.log(`📦 Limit: ${LIMIT}\n`);

  // Validate OAuth creds
  if (!CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
    throw new Error("Missing X OAuth credentials. Need: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
  }

  // Fetch published posts not yet notified
  const { data: posts, error } = await supabase
    .from("x_posts")
    .select(`
      id, tweet_id, author_handle, author_name, body,
      tweet_url, politician_id, whytho_question_id
    `)
    .eq("status", "published")
    .not("whytho_question_id", "is", null)
    .not("tweet_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(LIMIT);

  if (error) throw error;
  if (!posts || posts.length === 0) {
    console.log("No published posts to notify. Run jack-publisher first.");
    return;
  }

  // Filter out already-notified (check outreach log)
  const postIds = posts.map((p) => p.id);
  const { data: alreadyLogged } = await supabase
    .from("x_outreach_log")
    .select("x_post_id")
    .eq("target_type", "constituent")
    .in("x_post_id", postIds);

  const notifiedSet = new Set((alreadyLogged ?? []).map((r) => r.x_post_id));
  const toNotify = posts.filter((p) => !notifiedSet.has(p.id));

  console.log(`→ ${posts.length} published posts | ${toNotify.length} unnotified\n`);

  if (toNotify.length === 0) {
    console.log("All published posts already notified. Nothing to do.");
    return;
  }

  // Enrich with politician slugs
  const polIds = [...new Set(toNotify.map((p) => p.politician_id).filter(Boolean))] as string[];
  const { data: politicians } = await supabase
    .from("politicians")
    .select("id, slug, full_name")
    .in("id", polIds);

  const polMap = new Map<string, { slug: string; full_name: string }>();
  for (const pol of politicians ?? []) {
    polMap.set(pol.id, { slug: pol.slug, full_name: pol.full_name });
  }

  // Send replies
  let sent    = 0;
  let skipped = 0;
  let errors  = 0;

  for (const post of toNotify) {
    const pol = post.politician_id ? polMap.get(post.politician_id) : undefined;
    if (!pol) {
      console.log(`  ⏭️  Skipping ${post.id} — no politician slug found`);
      skipped++;
      continue;
    }

    const replyText = buildReplyText(post.author_handle, pol.slug, post.whytho_question_id!);
    const preview   = post.body?.slice(0, 60) ?? "";

    console.log(`  📢 @${post.author_handle} → "${preview}..."`);
    console.log(`     Reply: "${replyText}"`);

    if (DRY_RUN) {
      console.log(`     [dry run — would mention @${post.author_handle}]`);
      sent++;
      continue;
    }

    try {
      const mentionTweetId = await postMention(replyText);

      // Log to x_outreach_log
      await supabase.from("x_outreach_log").insert({
        target_type:  "constituent",
        target_handle: post.author_handle,
        politician_id: post.politician_id,
        x_post_id:    post.id,
        channel:      "x_mention",
        message:      replyText,
        sent_at:      new Date().toISOString(),
        engagement:   { mention_tweet_id: mentionTweetId },
      });

      // Mark notified
      await supabase
        .from("x_posts")
        .update({ status: "notified", updated_at: new Date().toISOString() })
        .eq("id", post.id);

      console.log(`     ✅ Mentioned (tweet ID: ${mentionTweetId})`);
      sent++;
    } catch (err) {
      console.log(`     ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }

    // Rate limit: 2s between replies to be safe
    if (!DRY_RUN) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n======================");
  console.log("✅ Herald complete");
  console.log(`   Sent:    ${sent}`);
  console.log(`   Skipped: ${skipped}`);
  if (errors > 0) console.log(`   Errors:  ${errors}`);
  if (!DRY_RUN && sent > 0) {
    console.log(`\n   @WhyTho_official replied to ${sent} constituent tweets.`);
    console.log(`   Next: npx tsx scripts/jack-diplomat.ts  (politician outreach)`);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
