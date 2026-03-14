#!/usr/bin/env npx ts-node
/**
 * Seed politicians table from Congress.gov + OpenStates
 *
 * Usage:
 *   npx ts-node scripts/seed-politicians.ts
 *   npx ts-node scripts/seed-politicians.ts --federal-only
 *   npx ts-node scripts/seed-politicians.ts --states-only
 */

import { createClient } from "@supabase/supabase-js";
import type { Database, Enums } from "../types/database";
import { fetchAllMembers } from "../lib/civic/congress";
import { fetchAllTargetStateLegislators } from "../lib/civic/openstates";
import {
  normalizeCongressMember,
  normalizeOpenStatesPerson,
  deduplicatePoliticians,
  makeSlugUnique,
} from "../lib/civic/normalize";

// Load env
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function upsertPoliticians(
  normalized: ReturnType<typeof deduplicatePoliticians>
) {
  const existingSlugs = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const { politician, aliases } of normalized) {
    try {
      // Ensure slug uniqueness
      const slug = makeSlugUnique(politician.slug, existingSlugs);
      existingSlugs.add(slug);
      politician.slug = slug;

      // Upsert politician
      const { data, error } = await supabase
        .from("politicians")
        .upsert(
          { ...politician },
          {
            onConflict: "bioguide_id",
            ignoreDuplicates: false,
          }
        )
        .select("id, slug")
        .single();

      if (error) {
        // Try upsert by slug if bioguide_id not present
        const { data: bySlug, error: slugError } = await supabase
          .from("politicians")
          .upsert(politician, { onConflict: "slug", ignoreDuplicates: false })
          .select("id, slug")
          .single();

        if (slugError) {
          console.error(`Error upserting ${politician.full_name}:`, slugError.message);
          errors++;
          continue;
        }

        if (bySlug) {
          // Upsert aliases
          await upsertAliases(bySlug.id, aliases);
          updated++;
        }
        continue;
      }

      if (data) {
        await upsertAliases(data.id, aliases);
        inserted++;
      }
    } catch (err) {
      console.error(`Unexpected error for ${politician.full_name}:`, err);
      errors++;
    }
  }

  return { inserted, updated, errors };
}

async function upsertAliases(
  politicianId: string,
  aliases: Array<{ alias: string; alias_type: Enums<"alias_type"> }>
) {
  if (aliases.length === 0) return;

  await supabase
    .from("politician_aliases")
    .upsert(
      aliases.map((a) => ({ ...a, politician_id: politicianId })),
      { onConflict: "politician_id,alias", ignoreDuplicates: true }
    );
}

async function seedFederal() {
  console.log("\n🏛️  Fetching federal officials from Congress.gov...");
  const members = await fetchAllMembers();
  console.log(`  → ${members.length} members fetched`);

  const normalized = deduplicatePoliticians(
    members.map(normalizeCongressMember)
  );
  console.log(`  → ${normalized.length} after deduplication`);

  console.log("  → Upserting to database...");
  const result = await upsertPoliticians(normalized);
  console.log(`  ✅ Federal: ${result.inserted} inserted, ${result.updated} updated, ${result.errors} errors`);
}

async function seedStates() {
  console.log("\n🗺️  Fetching state legislators from OpenStates...");
  const stateData = await fetchAllTargetStateLegislators();

  let totalFetched = 0;
  const allNormalized = [];

  for (const [state, legislators] of stateData) {
    const normalized = legislators.map(normalizeOpenStatesPerson);
    allNormalized.push(...normalized);
    totalFetched += legislators.length;
    console.log(`  → ${state}: ${legislators.length} legislators`);
  }

  const deduped = deduplicatePoliticians(allNormalized);
  console.log(`  → ${totalFetched} total, ${deduped.length} after deduplication`);

  console.log("  → Upserting to database...");
  const result = await upsertPoliticians(deduped);
  console.log(`  ✅ States: ${result.inserted} inserted, ${result.updated} updated, ${result.errors} errors`);
}

async function main() {
  const args = process.argv.slice(2);
  const federalOnly = args.includes("--federal-only");
  const statesOnly = args.includes("--states-only");

  console.log("🌱 WhyTho politician seed script");
  console.log("=================================");

  if (!federalOnly && !statesOnly) {
    await seedFederal();
    await seedStates();
  } else if (federalOnly) {
    await seedFederal();
  } else if (statesOnly) {
    await seedStates();
  }

  // Final count
  const { count } = await supabase
    .from("politicians")
    .select("*", { count: "exact", head: true });

  console.log(`\n✅ Done. Total politicians in DB: ${count}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
