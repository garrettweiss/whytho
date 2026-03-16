#!/usr/bin/env npx ts-node
/**
 * Bulk seed 3 questions for every politician that doesn't have them yet.
 *
 * Usage:
 *   npx ts-node scripts/seed-all-questions.ts
 *   npx ts-node scripts/seed-all-questions.ts --week 202611
 *   npx ts-node scripts/seed-all-questions.ts --week 202611 --dry-run
 *   npx ts-node scripts/seed-all-questions.ts --week 202611 --limit 50
 *
 * Strategy:
 *   - Batch 5 politicians per Anthropic API call to minimize cost + time
 *   - Generate exactly 3 questions per politician
 *   - Questions represent a mix of constituent ideologies (conservative, progressive, bipartisan)
 *   - 1 second delay between batches
 *   - Skips politicians who already have >= TARGET questions this week
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

// ── Config ────────────────────────────────────────────────────────────────────

const TARGET_QUESTIONS = 3;      // min questions per politician
const BATCH_SIZE = 5;            // politicians per Anthropic call
const DELAY_MS = 1000;           // delay between batches
const GENERATE_PER_POLITICIAN = 3; // questions to generate per politician

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Politician {
  id: string;
  full_name: string;
  office: string | null;
  state: string | null;
  party: string | null;
  bio: string | null;
}

interface BatchResult {
  politician_id: string;
  questions: string[];
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a civic accountability assistant. Generate specific, factual questions that constituents of different political backgrounds might want their elected official to answer publicly.

RULES:
- Questions must be grounded in the official's public role, jurisdiction, or stated positions
- Each question should represent a DIFFERENT constituent perspective:
  * One question reflecting conservative/fiscal concerns (taxes, spending, small business, regulatory burden, border/security if applicable)
  * One question reflecting progressive concerns (healthcare access, climate/environment, workers' rights, social services, equity)
  * One question reflecting bipartisan/nonpartisan concerns (local infrastructure, veterans' services, constituent responsiveness, transparency, rural/urban services)
- All questions must be polite, specific, and answerable by the official
- 15-120 words per question
- Write in second person: "Why did you vote..." or "What is your position on..." or "How do you plan to..."
- No partisan attacks, no personal attacks, no unverifiable claims
- Questions must be relevant to this official's actual jurisdiction and role`;

function buildBatchPrompt(politicians: Politician[]): string {
  const politicianList = politicians
    .map((p, i) => {
      const lines = [
        `POLITICIAN ${i + 1}:`,
        `  ID: ${p.id}`,
        `  Name: ${p.full_name}`,
        `  Office: ${p.office ?? "Unknown"}`,
        `  State: ${p.state ?? "Unknown"}`,
        `  Party: ${p.party ?? "Unknown"}`,
      ];
      if (p.bio) lines.push(`  Bio: ${p.bio.slice(0, 300)}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return `Generate exactly ${GENERATE_PER_POLITICIAN} questions for each of the following ${politicians.length} politicians. Each set must include one conservative-leaning, one progressive-leaning, and one bipartisan question.

${politicianList}

Return ONLY a JSON object in this exact format:
{
  "results": [
    {
      "politician_id": "<exact id from above>",
      "questions": ["Question 1?", "Question 2?", "Question 3?"]
    }
  ]
}`;
}

// ── Generation ────────────────────────────────────────────────────────────────

async function generateBatch(politicians: Politician[]): Promise<BatchResult[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildBatchPrompt(politicians) }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]) as { results: BatchResult[] };
  if (!Array.isArray(parsed.results)) throw new Error("Missing results array");

  return parsed.results;
}

// ── Insertion ─────────────────────────────────────────────────────────────────

async function insertQuestions(
  politicianId: string,
  questions: string[],
  weekNumber: number,
  dryRun: boolean
): Promise<number> {
  // Validate questions
  const valid = questions.filter(
    (q) => typeof q === "string" && q.length >= 15 && q.length <= 500
  ).map((q) => q.trim().endsWith("?") ? q.trim() : `${q.trim()}?`);

  if (valid.length === 0) return 0;

  if (dryRun) return valid.length;

  const rows = valid.map((body) => ({
    politician_id: politicianId,
    body,
    week_number: weekNumber,
    is_seeded: true,
    status: "active" as const,
    submitted_by: null,
    net_upvotes: 0,
  }));

  const { error } = await supabase.from("questions").insert(rows);
  if (error) {
    console.error(`    ❌ Insert error for ${politicianId}:`, error.message);
    return 0;
  }

  return valid.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const weekArg = args.find((a) => a.startsWith("--week=") || a === "--week");
  let weekNumber: number;
  if (weekArg) {
    const val = weekArg.startsWith("--week=")
      ? weekArg.replace("--week=", "")
      : (args[args.indexOf("--week") + 1] ?? "");
    weekNumber = parseInt(val, 10);
  } else {
    // Default: current ISO week
    const now = new Date();
    const jan4 = new Date(now.getFullYear(), 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const mondayOfWeek1 = new Date(jan4);
    mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1);
    const diffMs = now.getTime() - mondayOfWeek1.getTime();
    const isoWeek = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    weekNumber = now.getFullYear() * 100 + isoWeek;
  }

  const limitArg = args.find((a) => a.startsWith("--limit=") || a === "--limit");
  let limit: number | null = null;
  if (limitArg) {
    const val = limitArg.startsWith("--limit=")
      ? limitArg.replace("--limit=", "")
      : (args[args.indexOf("--limit") + 1] ?? "");
    limit = parseInt(val, 10);
  }

  console.log("🌱 WhyTho — Bulk Question Seeder");
  console.log("==================================");
  console.log(`Week:     ${weekNumber}`);
  console.log(`Target:   ${TARGET_QUESTIONS} questions per politician`);
  console.log(`Batch:    ${BATCH_SIZE} politicians per API call`);
  console.log(`Dry run:  ${dryRun}`);
  if (limit) console.log(`Limit:    ${limit} politicians`);
  console.log();

  // ── Fetch politicians needing questions ──────────────────────────────────

  console.log("📊 Querying politicians needing questions...");

  // Paginate through all politicians (Supabase caps at 1000/page)
  const allPoliticians: Politician[] = [];
  const PAGE_SIZE = 1000;
  let page = 0;
  while (true) {
    const { data, error: fetchError } = await supabase
      .from("politicians")
      .select("id, full_name, office, state, party, bio")
      .eq("is_active", true)
      .order("full_name")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (fetchError) {
      console.error("❌ Failed to fetch politicians:", fetchError.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allPoliticians.push(...data);
    if (data.length < PAGE_SIZE) break; // last page
    page++;
  }

  // Get existing seeded question counts for this week.
  // Must paginate — Supabase PostgREST caps responses at 1,000 rows by default.
  const allExistingCounts: Array<{ politician_id: string }> = [];
  let qPage = 0;
  while (true) {
    const { data: pageData } = await supabase
      .from("questions")
      .select("politician_id")
      .eq("week_number", weekNumber)
      .eq("is_seeded", true)
      .eq("status", "active")
      .range(qPage * 1000, (qPage + 1) * 1000 - 1);
    if (!pageData || pageData.length === 0) break;
    allExistingCounts.push(...pageData);
    if (pageData.length < 1000) break;
    qPage++;
  }

  const countMap = new Map<string, number>();
  for (const row of allExistingCounts) {
    countMap.set(row.politician_id, (countMap.get(row.politician_id) ?? 0) + 1);
  }

  // Filter to those needing questions
  let needsQuestions = allPoliticians.filter(
    (p) => (countMap.get(p.id) ?? 0) < TARGET_QUESTIONS
  );

  if (limit) needsQuestions = needsQuestions.slice(0, limit);

  console.log(`  Total active politicians: ${allPoliticians.length}`);
  console.log(`  Already have ${TARGET_QUESTIONS}+ questions: ${allPoliticians.length - needsQuestions.length}`);
  console.log(`  Need questions: ${needsQuestions.length}`);
  console.log(`  Batches to process: ${Math.ceil(needsQuestions.length / BATCH_SIZE)}`);
  console.log();

  if (needsQuestions.length === 0) {
    console.log("✅ All politicians already have enough questions. Nothing to do.");
    return;
  }

  if (dryRun) {
    console.log("🔍 DRY RUN — no questions will be inserted.");
    console.log(`   Would generate ~${needsQuestions.length * TARGET_QUESTIONS} questions.`);
    return;
  }

  // ── Process in batches ────────────────────────────────────────────────────

  let totalInserted = 0;
  let totalErrors = 0;
  let processed = 0;
  const totalBatches = Math.ceil(needsQuestions.length / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < needsQuestions.length; batchIdx += BATCH_SIZE) {
    const batch = needsQuestions.slice(batchIdx, batchIdx + BATCH_SIZE);
    const batchNum = Math.floor(batchIdx / BATCH_SIZE) + 1;
    const pct = Math.round((batchNum / totalBatches) * 100);

    process.stdout.write(
      `\r  [${pct.toString().padStart(3)}%] Batch ${batchNum}/${totalBatches} — ${processed} politicians done, ${totalInserted} questions inserted...`
    );

    try {
      const results = await generateBatch(batch);

      for (const result of results) {
        const politician = batch.find((p) => p.id === result.politician_id);
        if (!politician) continue;

        const existing = countMap.get(politician.id) ?? 0;
        const needed = TARGET_QUESTIONS - existing;
        const questionsToInsert = result.questions.slice(0, needed);

        const inserted = await insertQuestions(
          politician.id,
          questionsToInsert,
          weekNumber,
          false
        );
        totalInserted += inserted;
        processed++;
      }
    } catch (err) {
      // Batch failed — try politicians individually
      console.error(`\n  ⚠️  Batch ${batchNum} failed, retrying individually: ${err instanceof Error ? err.message : err}`);

      for (const politician of batch) {
        try {
          const results = await generateBatch([politician]);
          const result = results[0];
          if (!result) continue;

          const existing = countMap.get(politician.id) ?? 0;
          const needed = TARGET_QUESTIONS - existing;
          const inserted = await insertQuestions(
            politician.id,
            result.questions.slice(0, needed),
            weekNumber,
            false
          );
          totalInserted += inserted;
          processed++;
        } catch (indErr) {
          console.error(`\n  ❌ Failed for ${politician.full_name}: ${indErr instanceof Error ? indErr.message : indErr}`);
          totalErrors++;
          processed++;
        }
      }
    }

    // Rate limit between batches
    if (batchIdx + BATCH_SIZE < needsQuestions.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n\n✅ Done!`);
  console.log(`   Politicians processed: ${processed}`);
  console.log(`   Questions inserted:    ${totalInserted}`);
  console.log(`   Errors:                ${totalErrors}`);
  console.log(`   Week:                  ${weekNumber}`);
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err);
  process.exit(1);
});
