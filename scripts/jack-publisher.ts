/**
 * Jack — Publisher Agent
 *
 * Promotes approved x_posts into WhyTho question records.
 * Runs after Curator approves posts (status='approved').
 *
 * One atomic RPC creates or recovers the source question, then links and marks
 * the post published. Retries keep the existing question and source attribution.
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
import { canonicalProfile, loadJackProfiles } from "./jack-identity";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = Math.min(500, parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "500"));

let published = 0;
let skipped = 0;
let errors = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCurrentWeek(): Promise<number> {
  const { data, error } = await supabase.rpc("current_week_number");
  if (error || typeof data !== "number" || !Number.isInteger(data)) throw new Error("Reporting week unavailable");
  return data;
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
  const profiles = DRY_RUN ? await loadJackProfiles(supabase) : [];

  for (const post of posts) {
    const body = cleanBody(post.body!);
    if (body.length < 10 || body.length > 500) {
      console.log(`  Skipping @${post.author_handle}: body must be 10 to 500 characters`);
      skipped++;
      continue;
    }

    console.log(`  📝 @${post.author_handle} → "${body.slice(0, 80)}..."`);

    if (DRY_RUN) {
      const canonical = post.politician_id ? canonicalProfile(profiles, post.politician_id) : undefined;
      if (!canonical) { errors++; console.log("     Identity unavailable; publication blocked"); continue; }
      console.log(`     [dry run: source ${post.politician_id}, canonical question destination ${canonical.id}]`);
      published++;
      continue;
    }

    try {
      const { data, error } = await supabase.rpc("publish_x_post", { p_x_post_id: post.id, p_body: body, p_week_number: weekNumber });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.question_id !== "string" || typeof data.published !== "boolean") {
        throw new Error("Publication result unavailable; inspect the post before retrying");
      }
      console.log(`     Question ${data.question_id}: ${data.published ? "published" : "existing publication retained"}`);
      if (data.published) published++; else skipped++;
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
  console.log(DRY_RUN ? "\n   Preview complete; no publication writes." : "\n   Published questions are visible on canonical politician profiles.");
  console.log("   Herald remains preview-only; outbound messages require separate approval.");
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
