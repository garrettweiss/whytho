/**
 * Jack — Publisher Agent
 *
 * Promotes approved x_posts into WhyTho question records.
 * Runs after Curator approves posts (status='approved').
 *
 * For each approved x_post:
 *   1. Inserts a question row (source='x', is_seeded=false, x_post_id=...)
 *   2. Sets x_posts.whytho_question_id = new question ID
 *   3. Sets x_posts.status = 'published'
 *
 * The tweet body becomes the question body verbatim.
 * Attribution is preserved via x_post_id → x_posts.author_handle / tweet_url.
 *
 * Usage:
 *   npx tsx scripts/jack-publisher.ts                 # All approved
 *   npx tsx scripts/jack-publisher.ts --dry-run       # Preview only
 *   npx tsx scripts/jack-publisher.ts --limit=50      # First N
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "500");

let published = 0;
let skipped = 0;
let errors = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCurrentWeek(): Promise<number> {
  const { data } = await supabase.rpc("current_week_number");
  return data as number;
}

function cleanBody(raw: string): string {
  // Strip @mentions at the start that are just address prefixes
  // Keep the question content — trim leading @handle references
  return raw
    .replace(/^(@\w+\s+)+/, "") // strip leading @mentions
    .trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📤 Jack — Publisher Agent");
  console.log("=========================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes\n");
  console.log(`📦 Limit: ${LIMIT}\n`);

  const weekNumber = await getCurrentWeek();
  console.log(`→ Current week: ${weekNumber}\n`);

  // Fetch approved posts not yet published
  const { data: posts, error } = await supabase
    .from("x_posts")
    .select("id, tweet_id, body, author_handle, author_name, politician_id, curator_score, theme_tags, tweet_url, tweet_date")
    .eq("status", "approved")
    .is("whytho_question_id", null)
    .not("body", "is", null)
    .not("politician_id", "is", null)
    .order("curator_score", { ascending: false })
    .limit(LIMIT);

  if (error) throw error;

  console.log(`→ ${posts?.length ?? 0} approved posts ready to publish\n`);

  if (!posts || posts.length === 0) {
    console.log("Nothing to publish. Run jack-harvester + jack-curator first.");
    return;
  }

  for (const post of posts) {
    const body = cleanBody(post.body!);
    if (body.length < 10) {
      console.log(`  ⏭️  Skipping @${post.author_handle} — body too short after cleaning`);
      skipped++;
      continue;
    }

    console.log(`  📝 @${post.author_handle} → "${body.slice(0, 80)}..."`);

    if (DRY_RUN) {
      console.log(`     [dry run — would create question for politician ${post.politician_id}]`);
      published++;
      continue;
    }

    try {
      // Insert the WhyTho question
      const { data: question, error: qErr } = await supabase
        .from("questions")
        .insert({
          body,
          politician_id: post.politician_id!,
          week_number: weekNumber,
          source: "x",
          is_seeded: false,
          submitted_by: null,
          x_post_id: post.id,
          status: "active",
          net_upvotes: 0,
        })
        .select("id")
        .single();

      if (qErr) {
        if (qErr.code === "23505") {
          console.log(`     ⏭️  Duplicate — already exists`);
          skipped++;
          continue;
        }
        throw qErr;
      }

      // Link x_post → question + mark published
      const { error: updateErr } = await supabase
        .from("x_posts")
        .update({
          whytho_question_id: question.id,
          status: "published",
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (updateErr) throw updateErr;

      console.log(`     ✅ Question created (${question.id})`);
      published++;
    } catch (err) {
      console.log(`     ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log("\n=========================");
  console.log("✅ Publishing complete");
  console.log(`   Published: ${published}`);
  console.log(`   Skipped:   ${skipped}`);
  if (errors > 0) console.log(`   Errors:    ${errors}`);
  console.log(`\n   Questions now live with source='x' — visible on politician profiles.`);
  console.log(`   Next: npx tsx scripts/jack-herald.ts  (notify via @WhyTho_official)`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
