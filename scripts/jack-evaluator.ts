/**
 * Jack — Evaluator Agent
 *
 * Continuous improvement agent that analyzes pipeline performance
 * and surfaces calibration insights to improve curator scoring over time.
 *
 * What it does:
 *   1. Pulls published X questions and their vote performance
 *   2. Compares curator scores vs actual constituent engagement
 *   3. Identifies scoring patterns — what score ranges led to high-vote questions
 *   4. Generates a calibration report with recommendations
 *   5. Saves report to jack_reports table for admin review
 *
 * Intended run cadence: weekly (after questions have had time to accumulate votes)
 *
 * Usage:
 *   npx tsx scripts/jack-evaluator.ts              # Full evaluation
 *   npx tsx scripts/jack-evaluator.ts --dry-run    # Report only, no DB write
 *   npx tsx scripts/jack-evaluator.ts --weeks=4    # Look back N weeks (default: 4)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase   = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes("--dry-run");
const LOOKBACK = parseInt(args.find((a) => a.startsWith("--weeks="))?.split("=")[1] ?? "4");

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublishedPost {
  id: string;
  curator_score: number | null;
  curator_notes: string | null;
  theme_tags: string[] | null;
  author_handle: string;
  tweet_url: string;
  body: string | null;
  whytho_question_id: string | null;
  question_votes: number;
  question_created_at: string | null;
}

interface RejectedPost {
  id: string;
  curator_score: number | null;
  rejection_reason: string | null;
  theme_tags: string[] | null;
  body: string | null;
}

interface EvaluationReport {
  generated_at: string;
  lookback_weeks: number;
  published_count: number;
  avg_published_votes: number;
  top_performers: Array<{ handle: string; score: number; votes: number; tweet_url: string }>;
  score_vs_votes: Array<{ score: number; avg_votes: number; count: number }>;
  top_themes: Array<{ tag: string; count: number; avg_votes: number }>;
  rejected_count: number;
  review_count: number;
  calibration_notes: string;
  recommendations: string[];
}

// ── Data collection ────────────────────────────────────────────────────────────

async function collectData(): Promise<{ published: PublishedPost[]; rejected: RejectedPost[]; reviewCount: number }> {
  const cutoff = new Date(Date.now() - LOOKBACK * 7 * 24 * 60 * 60 * 1000).toISOString();

  // Published: x_posts with status published/notified + their question vote count
  const { data: publishedPosts } = await supabase
    .from("x_posts")
    .select(`
      id, curator_score, curator_notes, theme_tags,
      author_handle, tweet_url, body, whytho_question_id,
      created_at
    `)
    .in("status", ["published", "notified"])
    .not("whytho_question_id", "is", null)
    .gte("created_at", cutoff);

  // Get vote counts for each published question
  const questionIds = (publishedPosts ?? []).map((p) => p.whytho_question_id).filter(Boolean) as string[];
  const { data: questions } = await supabase
    .from("questions")
    .select("id, net_upvotes, created_at")
    .in("id", questionIds);

  const voteMap = new Map<string, number>();
  const dateMap = new Map<string, string>();
  for (const q of questions ?? []) {
    voteMap.set(q.id, q.net_upvotes);
    dateMap.set(q.id, q.created_at);
  }

  const published: PublishedPost[] = (publishedPosts ?? []).map((p) => ({
    id:                 p.id,
    curator_score:      p.curator_score,
    curator_notes:      p.curator_notes,
    theme_tags:         p.theme_tags,
    author_handle:      p.author_handle,
    tweet_url:          p.tweet_url,
    body:               p.body,
    whytho_question_id: p.whytho_question_id,
    question_votes:     voteMap.get(p.whytho_question_id!) ?? 0,
    question_created_at: dateMap.get(p.whytho_question_id!) ?? p.created_at,
  }));

  // Rejected posts
  const { data: rejectedPosts } = await supabase
    .from("x_posts")
    .select("id, curator_score, rejection_reason, theme_tags, body")
    .eq("status", "rejected")
    .gte("created_at", cutoff)
    .limit(200);

  // Review queue count
  const { count: reviewCount } = await supabase
    .from("x_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "review");

  return {
    published,
    rejected: rejectedPosts ?? [],
    reviewCount: reviewCount ?? 0,
  };
}

// ── Compute stats ─────────────────────────────────────────────────────────────

function computeStats(published: PublishedPost[]) {
  const avgVotes = published.length > 0
    ? published.reduce((s, p) => s + p.question_votes, 0) / published.length
    : 0;

  // Top performers by votes
  const topPerformers = [...published]
    .sort((a, b) => b.question_votes - a.question_votes)
    .slice(0, 5)
    .map((p) => ({
      handle:   p.author_handle,
      score:    p.curator_score ?? 0,
      votes:    p.question_votes,
      tweet_url: p.tweet_url,
    }));

  // Score vs votes (group by curator score)
  const scoreGroups = new Map<number, number[]>();
  for (const p of published) {
    const s = p.curator_score ?? 8;
    if (!scoreGroups.has(s)) scoreGroups.set(s, []);
    scoreGroups.get(s)!.push(p.question_votes);
  }
  const scoreVsVotes = [...scoreGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([score, votes]) => ({
      score,
      avg_votes: votes.reduce((s, v) => s + v, 0) / votes.length,
      count:     votes.length,
    }));

  // Theme performance
  const themeVotes = new Map<string, number[]>();
  for (const p of published) {
    for (const tag of p.theme_tags ?? []) {
      if (!themeVotes.has(tag)) themeVotes.set(tag, []);
      themeVotes.get(tag)!.push(p.question_votes);
    }
  }
  const topThemes = [...themeVotes.entries()]
    .map(([tag, votes]) => ({
      tag,
      count:     votes.length,
      avg_votes: votes.reduce((s, v) => s + v, 0) / votes.length,
    }))
    .sort((a, b) => b.avg_votes - a.avg_votes)
    .slice(0, 10);

  return { avgVotes, topPerformers, scoreVsVotes, topThemes };
}

// ── Claude calibration analysis ───────────────────────────────────────────────

async function generateCalibrationNotes(
  published: PublishedPost[],
  rejected: RejectedPost[],
  stats: ReturnType<typeof computeStats>
): Promise<{ notes: string; recommendations: string[] }> {
  const prompt = `You are the Evaluator for Jack, WhyTho's civic accountability pipeline.

WhyTho pulls real constituent questions from X (Twitter) directed at politicians.
The Curator scores them 1-10 (auto-approve ≥8, review 5-7, reject <5).

## Pipeline Performance — Last ${LOOKBACK} Weeks

### Published Questions (auto-approved, score ≥8)
Total published: ${published.length}
Average votes received: ${stats.avgVotes.toFixed(1)}

Top performers by votes:
${stats.topPerformers.map((p) => `- Score ${p.score}: "${p.tweet_url}" → ${p.votes} votes`).join("\n") || "(none yet)"}

Score vs average votes:
${stats.scoreVsVotes.map((s) => `- Score ${s.score}: ${s.avg_votes.toFixed(1)} avg votes (${s.count} questions)`).join("\n") || "(no data)"}

Top themes by engagement:
${stats.topThemes.map((t) => `- ${t.tag}: ${t.avg_votes.toFixed(1)} avg votes (${t.count} questions)`).join("\n") || "(none)"}

### Rejected Questions (score <5)
Total rejected in period: ${rejected.length}
Top rejection reasons: ${[...new Set(rejected.map((r) => r.rejection_reason).filter(Boolean))].join(", ") || "(none)"}

## Your Task
Analyze this data and provide:
1. Calibration notes: Is the curator scoring well? Are high-score questions getting proportionally more votes?
2. Specific recommendations to improve the scoring rubric or thresholds

Response format (JSON only, no markdown):
{
  "notes": "<2-3 sentence calibration analysis>",
  "recommendations": ["<specific actionable recommendation 1>", "<recommendation 2>", "..."]
}

Be concise and specific. Focus on what's working and what should change.`;

  const response = await anthropic.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 600,
    messages:   [{ role: "user", content: prompt }],
  });

  const raw     = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { notes?: string; recommendations?: string[] };
    return {
      notes:           parsed.notes ?? "Insufficient data for calibration.",
      recommendations: parsed.recommendations ?? [],
    };
  } catch {
    return {
      notes:           "Could not parse calibration response.",
      recommendations: ["Review Claude output manually."],
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📊 Jack — Evaluator Agent");
  console.log("=========================");
  if (DRY_RUN) console.log("🔍 DRY RUN — report only, no DB write\n");
  console.log(`📅 Lookback: ${LOOKBACK} weeks\n`);

  console.log("→ Collecting pipeline data...");
  const { published, rejected, reviewCount } = await collectData();
  console.log(`   Published:  ${published.length} questions`);
  console.log(`   In review:  ${reviewCount}`);
  console.log(`   Rejected:   ${rejected.length}\n`);

  if (published.length === 0) {
    console.log("No published questions yet. Run the full pipeline (harvester → curator → publisher) first.");
    return;
  }

  const stats = computeStats(published);

  console.log("→ Generating calibration analysis (Claude haiku)...\n");
  const { notes, recommendations } = await generateCalibrationNotes(published, rejected, stats);

  const report: EvaluationReport = {
    generated_at:       new Date().toISOString(),
    lookback_weeks:     LOOKBACK,
    published_count:    published.length,
    avg_published_votes: parseFloat(stats.avgVotes.toFixed(2)),
    top_performers:     stats.topPerformers,
    score_vs_votes:     stats.scoreVsVotes,
    top_themes:         stats.topThemes,
    rejected_count:     rejected.length,
    review_count:       reviewCount,
    calibration_notes:  notes,
    recommendations,
  };

  // Print report
  console.log("=========================");
  console.log("📊 EVALUATION REPORT");
  console.log("=========================\n");
  console.log(`Published:          ${report.published_count} questions`);
  console.log(`Avg votes received: ${report.avg_published_votes}`);
  console.log(`In review queue:    ${report.review_count}`);
  console.log(`Rejected:           ${report.rejected_count}\n`);

  if (stats.topPerformers.length > 0) {
    console.log("Top performing questions:");
    stats.topPerformers.forEach((p) => {
      console.log(`  Score ${p.score} → ${p.votes} votes | @${p.handle}`);
    });
    console.log();
  }

  if (stats.topThemes.length > 0) {
    console.log("Top themes by engagement:");
    stats.topThemes.slice(0, 5).forEach((t) => {
      console.log(`  ${t.tag}: ${t.avg_votes.toFixed(1)} avg votes (${t.count} questions)`);
    });
    console.log();
  }

  console.log("Calibration notes:");
  console.log(`  ${notes}\n`);

  if (recommendations.length > 0) {
    console.log("Recommendations:");
    recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
    console.log();
  }

  // Save to DB
  if (!DRY_RUN) {
    // jack_reports schema: { id, week_number, report (jsonb), created_at }
    const { data: weekData } = await supabase.rpc("current_week_number");
    const weekNumber = weekData as number;

    const { error } = await supabase
      .from("jack_reports")
      .insert({
        week_number: weekNumber,
        report:      report as unknown as Database["public"]["Tables"]["jack_reports"]["Insert"]["report"],
        created_at:  new Date().toISOString(),
      });

    if (error) {
      console.log(`⚠️  Could not save report to DB: ${error.message}`);
      console.log("   (jack_reports table may need creation — report printed above)");
    } else {
      console.log("✅ Report saved to jack_reports table.");
    }
  }

  console.log(`\n   Next: Review /admin/x-queue, then run harvester again for fresh tweets.`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
