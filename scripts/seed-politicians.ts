#!/usr/bin/env npx ts-node
/**
 * Seed politicians table from Congress.gov + OpenStates
 *
 * Usage:
 *   npx ts-node scripts/seed-politicians.ts             # read-only preview
 *   npx ts-node scripts/seed-politicians.ts --apply     # explicit writes
 *   npx ts-node scripts/seed-politicians.ts --federal-only
 *   npx ts-node scripts/seed-politicians.ts --states-only
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { fetchAllMembers } from "../lib/civic/congress";
import { fetchStateLegislators } from "../lib/civic/openstates";
import {
  normalizeCongressMember,
  normalizeOpenStatesPerson,
  deduplicatePoliticians,
} from "../lib/civic/normalize";

import { importCivicObservation, officialObservation, shouldApplyImport } from "../lib/civic/import-observation";

// Load env
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APPLY = shouldApplyImport(process.argv.slice(2));

async function upsertPoliticians(
  normalized: ReturnType<typeof deduplicatePoliticians>
) {
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let reviewRequired = 0;
  let photoReviewRequired = 0;

  for (const entry of normalized) {
    try {
      const result = await importCivicObservation(supabase, officialObservation(entry), APPLY);
      if (result.photoStatus === "review_required") photoReviewRequired++;
      if (result.status === "review_required") {
        reviewRequired++;
        console.warn(`Review required for ${entry.politician.full_name}: ${result.reason}`);
      } else if (result.status === "matched") {
        updated++;
      } else {
        inserted++;
      }
    } catch (err) {
      console.error(`Import failed for ${entry.politician.full_name}:`, err);
      errors++;
    }
  }
  if (errors) process.exitCode = 1;
  console.log(`  Identity review required: ${reviewRequired}`);
  console.log(`  Portrait review required: ${photoReviewRequired} (source evidence retained; public photos unchanged)`);
  return { inserted, updated, errors };
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

async function seedStates(only?: string[]) {
  console.log("\n🗺️  Fetching + upserting state legislators (one state at a time)...");
  const ALL_STATES = [
    "al","ak","az","ar","ca","co","ct","de","fl","ga",
    "hi","id","il","in","ia","ks","ky","la","me","md",
    "ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
    "nm","ny","nc","nd","oh","ok","or","pa","ri","sc",
    "sd","tn","tx","ut","vt","va","wa","wv","wi","wy",
  ] as const;
  const states = only
    ? ALL_STATES.filter((s) => only.includes(s))
    : ALL_STATES;

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const state of states) {
    console.log(`\n  📍 ${state.toUpperCase()}...`);
    try {
      const legislators = await fetchStateLegislators(state);
      console.log(`    → ${legislators.length} fetched`);

      const normalized = legislators.map(normalizeOpenStatesPerson);
      const deduped = deduplicatePoliticians(normalized);
      const result = await upsertPoliticians(deduped);
      console.log(`    ✅ ${result.inserted} inserted, ${result.updated} updated, ${result.errors} errors`);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalErrors += result.errors;
    } catch (err) {
      console.error(`    ❌ Failed for ${state}:`, err instanceof Error ? err.message : err);
      totalErrors++;
    }
    // Wait between states to respect rate limits
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(`\n  ✅ States total: ${totalInserted} inserted, ${totalUpdated} updated, ${totalErrors} errors`);
}

async function main() {
  const args = process.argv.slice(2);
  const federalOnly = args.includes("--federal-only");
  const statesOnly = args.includes("--states-only");
  // --state=pa,oh,ga — run specific states only
  const stateArg = args.find((a) => a.startsWith("--state="));
  const specificStates = stateArg ? stateArg.replace("--state=", "").split(",") : null;

  console.log("🌱 WhyTho politician seed script");
  console.log("=================================");
  console.log(APPLY ? "Mode: APPLY" : "Mode: DRY RUN (no writes); pass --apply to write");
  console.log("Portrait source evidence is retained for the reviewed portrait pipeline.");

  if (specificStates) {
    await seedStates(specificStates);
  } else if (!federalOnly && !statesOnly) {
    await seedFederal();
    await seedStates();
  } else if (federalOnly) {
    await seedFederal();
  } else if (statesOnly) {
    await seedStates();
  }

  // Final count
  const { count, error } = await supabase
    .from("politicians")
    .select("*", { count: "exact", head: true });

  if (error) throw new Error(`Final count failed: ${error.message}`);
  console.log(`\n✅ Done. Total politicians in DB: ${count}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
