/**
 * Jack — Diplomat Agent
 *
 * Determines the best outreach channel for each politician and sends
 * a notification that constituents are asking questions on WhyTho.
 *
 * Strategy per politician:
 *   1. If they have an X handle → reply to their most recent tweet mentioning WhyTho
 *   2. Otherwise → log "no channel" for future email / contact form expansion
 *
 * Only reaches out once per politician per campaign (tracked in x_outreach_log).
 * Target: politicians who have questions with net_upvotes >= 5 and no WhyTho account.
 *
 * Usage:
 *   npx tsx scripts/jack-diplomat.ts                  # All eligible politicians
 *   npx tsx scripts/jack-diplomat.ts --dry-run        # Preview only
 *   npx tsx scripts/jack-diplomat.ts --limit=10       # First N politicians
 *   npx tsx scripts/jack-diplomat.ts --min-votes=5    # Qualifying vote threshold (default: 5)
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
const SITE_URL        = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return raw.includes("localhost") ? "https://whytho.us" : (raw || "https://whytho.us");
})();

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes("--dry-run");
const LIMIT     = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "50");
const MIN_VOTES = parseInt(args.find((a) => a.startsWith("--min-votes="))?.split("=")[1] ?? "5");

// ── OAuth 1.0a ────────────────────────────────────────────────────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21").replace(/'/g, "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function buildOAuthHeader(method: string, url: string): string {
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

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k] ?? "")}`)
    .join("&");

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(CONSUMER_SECRET)}&${percentEncode(ACCESS_SECRET)}`;
  const signature  = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  return "OAuth " + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k] ?? "")}"`)
    .join(", ");
}

// ── Post tweet ────────────────────────────────────────────────────────────────

async function postTweet(text: string, inReplyToId?: string): Promise<string> {
  const url  = "https://api.twitter.com/2/tweets";
  const body: Record<string, unknown> = { text };
  if (inReplyToId) body.reply = { in_reply_to_tweet_id: inReplyToId };

  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: buildOAuthHeader("POST", url), "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(rawText) as { detail?: string; title?: string };
      msg = err.detail ?? err.title ?? msg;
    } catch { /* noop */ }
    throw new Error(`X API error: ${msg}`);
  }

  const json = JSON.parse(rawText) as { data?: { id: string } };
  return json.data!.id;
}

// ── Build outreach message ─────────────────────────────────────────────────────

function buildOutreachMessage(handle: string, slug: string, questionCount: number): string {
  const url = `${SITE_URL}/${slug}`;
  const q   = questionCount === 1 ? "question" : "questions";
  // Stay under 280 chars
  return `@${handle} Your constituents have ${questionCount} ${q} for you on WhyTho — a civic accountability platform. Your response rate is always public.\n${url}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🤝 Jack — Diplomat Agent");
  console.log("========================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no tweets will be sent\n");
  console.log(`📦 Limit: ${LIMIT} | Min votes threshold: ${MIN_VOTES}\n`);

  if (!DRY_RUN && (!CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET)) {
    throw new Error("Missing X OAuth credentials. Check X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
  }

  // Find politicians with qualifying questions (no WhyTho account, has X handle)
  const { data: politicians, error } = await supabase
    .from("politicians")
    .select("id, full_name, slug, social_handles, verification_tier")
    .eq("verification_tier", "0") // UNCLAIMED only — don't outreach to politicians who already joined
    .not("social_handles", "is", null)
    .limit(500); // fetch wide, filter below

  if (error) throw error;

  // Filter: must have a Twitter handle
  const withHandles = (politicians ?? []).filter((p) => {
    const handles = (p.social_handles ?? {}) as Record<string, string>;
    return !!handles.twitter;
  });

  console.log(`→ ${withHandles.length} unclaimed politicians with X handles\n`);

  // Check which have qualifying questions
  const polIds = withHandles.map((p) => p.id);

  const { data: qualifyingQuestions } = await supabase
    .from("questions")
    .select("politician_id")
    .in("politician_id", polIds)
    .gte("net_upvotes", MIN_VOTES)
    .eq("status", "active");

  // Count qualifying questions per politician
  const qualifyingCounts = new Map<string, number>();
  for (const q of qualifyingQuestions ?? []) {
    if (!q.politician_id) continue;
    qualifyingCounts.set(q.politician_id, (qualifyingCounts.get(q.politician_id) ?? 0) + 1);
  }

  const eligible = withHandles
    .filter((p) => (qualifyingCounts.get(p.id) ?? 0) > 0)
    .sort((a, b) => (qualifyingCounts.get(b.id) ?? 0) - (qualifyingCounts.get(a.id) ?? 0))
    .slice(0, LIMIT);

  console.log(`→ ${eligible.length} politicians with qualifying questions\n`);

  if (eligible.length === 0) {
    console.log("No eligible politicians found. Ensure questions have enough votes.");
    return;
  }

  // Filter out already-contacted (check x_outreach_log)
  const eligibleIds = eligible.map((p) => p.id);
  const { data: alreadyContacted } = await supabase
    .from("x_outreach_log")
    .select("politician_id")
    .eq("target_type", "politician")
    .in("politician_id", eligibleIds);

  const contactedSet = new Set((alreadyContacted ?? []).map((r) => r.politician_id));
  const toContact    = eligible.filter((p) => !contactedSet.has(p.id));

  console.log(`→ ${toContact.length} not yet contacted\n`);

  if (toContact.length === 0) {
    console.log("All eligible politicians already contacted.");
    return;
  }

  let sent    = 0;
  let skipped = 0;
  let errors  = 0;

  for (const pol of toContact) {
    const handles      = (pol.social_handles ?? {}) as Record<string, string>;
    const twitterHandle = handles.twitter;
    if (!twitterHandle) { skipped++; continue; }

    const questionCount = qualifyingCounts.get(pol.id) ?? 0;
    const message       = buildOutreachMessage(twitterHandle, pol.slug, questionCount);

    console.log(`  📬 @${twitterHandle} (${pol.full_name})`);
    console.log(`     ${questionCount} qualifying question${questionCount !== 1 ? "s" : ""}`);
    console.log(`     Message: "${message}"`);

    if (DRY_RUN) {
      console.log(`     [dry run — would tweet]\n`);
      sent++;
      continue;
    }

    try {
      const tweetId = await postTweet(message);

      // Log to x_outreach_log
      await supabase.from("x_outreach_log").insert({
        target_type:   "politician",
        target_handle: twitterHandle,
        politician_id: pol.id,
        channel:       "x_mention",
        message,
        sent_at:       new Date().toISOString(),
        engagement:    { tweet_id: tweetId, question_count: questionCount },
      });

      console.log(`     ✅ Tweeted (${tweetId})\n`);
      sent++;
    } catch (err) {
      console.log(`     ❌ Error: ${err instanceof Error ? err.message : String(err)}\n`);
      errors++;
    }

    // 3s delay between politician outreach tweets (conservative)
    if (!DRY_RUN) await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("========================");
  console.log("✅ Diplomat complete");
  console.log(`   Sent:    ${sent}`);
  console.log(`   Skipped: ${skipped}`);
  if (errors > 0) console.log(`   Errors:  ${errors}`);
  if (!DRY_RUN && sent > 0) {
    console.log(`\n   @WhyTho_official has notified ${sent} politicians.`);
    console.log(`   Next run: check back after 48h for engagement, then run jack-evaluator.ts`);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
