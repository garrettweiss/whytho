/**
 * Jack — Curator Agent
 *
 * Reads x_posts with status='pending' from the Harvester.
 * Uses Claude (haiku) to score each tweet 1–10 on quality as a WhyTho question.
 *
 * Scoring criteria:
 *   - Is it a genuine question directed at the politician?
 *   - Is it substantive / policy-relevant (not just rants, jokes, or spam)?
 *   - Is it not already covered by an existing WhyTho question for this politician?
 *   - Does it represent real constituent concern?
 *
 * Outcomes:
 *   score ≥ 8  → status = 'approved'  (ready for Publisher)
 *   score 5–7  → status = 'review'    (queued for admin /admin/x-queue)
 *   score < 5  → status = 'rejected'
 *
 * Writes back: curator_score, curator_notes, rejection_reason, theme_tags, status
 *
 * Usage:
 *   npx tsx scripts/jack-curator.ts                    # All pending
 *   npx tsx scripts/jack-curator.ts --dry-run          # Score only, no writes
 *   npx tsx scripts/jack-curator.ts --limit=20         # First N pending posts
 *   npx tsx scripts/jack-curator.ts --approved-only    # Re-review approved (QA mode)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const APPROVED_ONLY = args.includes("--approved-only");
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "500");
const BATCH_SIZE = 5; // concurrent Claude calls

// ── Stats ─────────────────────────────────────────────────────────────────────

let processed = 0;
let approved = 0;
let queued = 0;
let rejected = 0;
let errors = 0;
let inputTokensTotal = 0;
let outputTokensTotal = 0;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingPost {
  id: string;
  tweet_id: string;
  body: string | null;
  author_handle: string;
  author_name: string | null;
  likes: number | null;
  retweets: number | null;
  reply_count: number | null;
  tweet_date: string | null;
  tweet_url: string;
  politician_id: string | null;
  politician_name?: string;
  politician_office?: string;
  politician_state?: string;
}

interface CurationResult {
  score: number;
  status: "approved" | "review" | "rejected";
  curator_notes: string;
  rejection_reason: string | null;
  theme_tags: string[];
}

// ── Fetch pending posts ───────────────────────────────────────────────────────

async function getPendingPosts(): Promise<PendingPost[]> {
  const statusFilter = APPROVED_ONLY ? "approved" : "pending";

  const { data, error } = await supabase
    .from("x_posts")
    .select(`
      id, tweet_id, body, author_handle, author_name,
      likes, retweets, reply_count, tweet_date, tweet_url, politician_id
    `)
    .eq("status", statusFilter)
    .not("body", "is", null)
    .order("likes", { ascending: false }) // prioritize high-engagement tweets
    .limit(LIMIT);

  if (error) throw error;

  const posts = data ?? [];

  // Enrich with politician info
  const politicianIds = [...new Set(posts.map((p) => p.politician_id).filter(Boolean))] as string[];
  const politicianMap = new Map<string, { full_name: string; office: string; state: string }>();

  if (politicianIds.length > 0) {
    const { data: pols } = await supabase
      .from("politicians")
      .select("id, full_name, office, state")
      .in("id", politicianIds);

    for (const pol of pols ?? []) {
      politicianMap.set(pol.id, {
        full_name: pol.full_name,
        office: pol.office ?? "",
        state: pol.state ?? "",
      });
    }
  }

  return posts.map((p) => {
    const pol = p.politician_id ? politicianMap.get(p.politician_id) : undefined;
    return {
      ...p,
      politician_name: pol?.full_name,
      politician_office: pol?.office,
      politician_state: pol?.state,
    };
  });
}

// ── Fetch existing WhyTho questions for duplicate check ───────────────────────

async function getExistingQuestions(politicianId: string): Promise<string[]> {
  const { data } = await supabase
    .from("questions")
    .select("body")
    .eq("politician_id", politicianId)
    .eq("status", "active")
    .limit(50);

  return (data ?? []).map((q) => q.body);
}

// ── Claude scoring ────────────────────────────────────────────────────────────

async function scoreTweet(post: PendingPost, existingQuestions: string[]): Promise<CurationResult> {
  const politicianContext = post.politician_name
    ? `${post.politician_name} (${post.politician_office ?? "Unknown office"}, ${post.politician_state ?? ""})`
    : "Unknown politician";

  const existingQSample = existingQuestions.slice(0, 15).join("\n- ");

  const prompt = `You are the Curator for WhyTho, a civic accountability platform where constituents ask questions of elected officials.

Your job: evaluate whether this tweet should become a question on WhyTho.

## Tweet
Author: @${post.author_handle}${post.author_name ? ` (${post.author_name})` : ""}
Posted: ${post.tweet_date ?? "unknown date"}
Likes: ${post.likes ?? 0} | Retweets: ${post.retweets ?? 0} | Replies: ${post.reply_count ?? 0}
Text: "${post.body}"

## Target Politician
${politicianContext}

## Existing WhyTho Questions for This Politician (check for duplicates)
${existingQSample ? `- ${existingQSample}` : "(none yet)"}

## Scoring Rubric (1–10)
Score HIGH (8–10) if ALL are true:
  - It IS a genuine question (contains ? or clear interrogative intent)
  - It is directed at the politician (mentions their handle/name/role or is clearly addressed to them)
  - It is substantive — relates to policy, legislation, votes, public statements, or conduct in office
  - It represents a concern a real constituent would have
  - It is NOT covered by an existing WhyTho question (would add new value)

Score MEDIUM (5–7) if:
  - It is a question but slightly vague, personal attack, or marginal relevance
  - It may duplicate an existing question but asks it differently
  - It has potential but needs editorial judgment

Score LOW (1–4) if ANY are true:
  - Not a genuine question
  - Pure insult / harassment / trolling
  - Off-topic (not about the politician's public role)
  - Bot-like or clearly spam
  - Duplicate of an existing question

## Response Format (JSON only, no markdown)
{
  "score": <1-10>,
  "status": <"approved"|"review"|"rejected">,
  "curator_notes": "<1-2 sentence reasoning>",
  "rejection_reason": <"not_a_question"|"spam_harassment"|"off_topic"|"duplicate"|"low_quality"|null>,
  "theme_tags": ["<tag1>", "<tag2>"]
}

Rules:
- score ≥ 8 → status = "approved"
- score 5–7 → status = "review"
- score < 5 → status = "rejected"
- theme_tags: 1–4 tags from: policy, healthcare, economy, immigration, education, environment, housing, veterans, foreign_policy, civil_rights, transparency, budget, taxes, gun_control, infrastructure, social_security, voting_rights, corruption, other
- rejection_reason must be null if status is "approved" or "review"
- Return ONLY valid JSON`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const usage = response.usage;
  inputTokensTotal += usage.input_tokens;
  outputTokensTotal += usage.output_tokens;

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text.trim() : "{}";

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let result: CurationResult;
  try {
    result = JSON.parse(cleaned) as CurationResult;
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  // Clamp score and derive status if Claude got confused
  result.score = Math.max(1, Math.min(10, Math.round(result.score)));
  if (result.score >= 8) result.status = "approved";
  else if (result.score >= 5) result.status = "review";
  else result.status = "rejected";

  if (result.status === "approved" || result.status === "review") {
    result.rejection_reason = null;
  }

  return result;
}

// ── Write result back to DB ───────────────────────────────────────────────────

async function updatePost(id: string, result: CurationResult) {
  const { error } = await supabase
    .from("x_posts")
    .update({
      status: result.status,
      curator_score: result.score,
      curator_notes: result.curator_notes,
      rejection_reason: result.rejection_reason,
      theme_tags: result.theme_tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

// ── Process in batches ────────────────────────────────────────────────────────

async function processBatch(posts: PendingPost[]) {
  await Promise.all(
    posts.map(async (post) => {
      const body = post.body?.slice(0, 280) ?? "(no text)";
      process.stdout.write(`  🔍 @${post.author_handle} → "${body.slice(0, 60)}..."  `);

      try {
        const existingQs = post.politician_id
          ? await getExistingQuestions(post.politician_id)
          : [];

        const result = await scoreTweet(post, existingQs);

        const icon =
          result.status === "approved" ? "✅" :
          result.status === "review"   ? "🟡" : "❌";

        console.log(`${icon} ${result.score}/10 — ${result.curator_notes.slice(0, 80)}`);

        if (!DRY_RUN) {
          await updatePost(post.id, result);
        }

        processed++;
        if (result.status === "approved") approved++;
        else if (result.status === "review") queued++;
        else rejected++;
      } catch (err) {
        console.log(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
        errors++;
      }
    })
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎯 Jack — Curator Agent");
  console.log("=======================");
  if (DRY_RUN) console.log("🔍 DRY RUN — scoring only, no writes\n");
  if (APPROVED_ONLY) console.log("🔄 QA MODE — re-reviewing approved posts\n");
  console.log(`🤖 Model: claude-haiku-4-5 | Limit: ${LIMIT} | Batch: ${BATCH_SIZE}\n`);

  const posts = await getPendingPosts();
  console.log(`→ ${posts.length} posts to curate\n`);

  if (posts.length === 0) {
    console.log("Nothing to do. Run jack-harvester first.");
    return;
  }

  // Process in batches to limit concurrency
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    await processBatch(batch);
  }

  // Summary
  const approvalRate = processed > 0 ? Math.round((approved / processed) * 100) : 0;
  const costEstimate = ((inputTokensTotal / 1_000_000) * 0.25 + (outputTokensTotal / 1_000_000) * 1.25).toFixed(4);

  console.log("\n=======================");
  console.log("✅ Curation complete");
  console.log(`   Processed:     ${processed}`);
  console.log(`   ✅ Approved:   ${approved} (${approvalRate}% approval rate)`);
  console.log(`   🟡 Review:     ${queued}  → /admin/x-queue`);
  console.log(`   ❌ Rejected:   ${rejected}`);
  if (errors > 0) console.log(`   ⚠️  Errors:    ${errors}`);
  console.log(`\n   Tokens used:   ${inputTokensTotal.toLocaleString()} in / ${outputTokensTotal.toLocaleString()} out`);
  console.log(`   Est. cost:     ~$${costEstimate} (haiku pricing)`);
  console.log(`\n   Next: npx tsx scripts/jack-publisher.ts`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
