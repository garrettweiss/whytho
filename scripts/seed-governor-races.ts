/**
 * Seed 2026 gubernatorial races
 *
 * 36 states have gubernatorial elections in 2026.
 * This script creates race records and links incumbent governors.
 * Run AFTER governors are in the DB (scripts/seed-governors.ts).
 *
 * Usage:
 *   npx tsx scripts/seed-governor-races.ts
 *   npx tsx scripts/seed-governor-races.ts --dry-run
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");

// 36 states with governor elections in 2026
// election_type: 'primary' or 'general' — we track the primary cycle
// primary_date: approximate (verify per state)
const GOV_RACES_2026 = [
  { state: "AL", primary_date: "2026-06-02" },
  { state: "AK", primary_date: "2026-08-25" },
  { state: "AZ", primary_date: "2026-08-04" },
  { state: "AR", primary_date: "2026-05-19" },
  { state: "CA", primary_date: "2026-06-02" },
  { state: "CO", primary_date: "2026-06-23" },
  { state: "CT", primary_date: "2026-08-11" },
  { state: "FL", primary_date: "2026-08-18" },
  { state: "GA", primary_date: "2026-05-19" },
  { state: "HI", primary_date: "2026-08-08" },
  { state: "ID", primary_date: "2026-05-19" },
  { state: "IL", primary_date: "2026-03-17" },
  { state: "IA", primary_date: "2026-06-02" },
  { state: "KS", primary_date: "2026-08-04" },
  { state: "ME", primary_date: "2026-06-09" },
  { state: "MD", primary_date: "2026-06-23" },
  { state: "MA", primary_date: "2026-09-15" },
  { state: "MI", primary_date: "2026-08-04" },
  { state: "MN", primary_date: "2026-08-11" },
  { state: "NE", primary_date: "2026-05-12" },
  { state: "NV", primary_date: "2026-06-09" },
  { state: "NH", primary_date: "2026-09-08" },
  { state: "NM", primary_date: "2026-06-02" },
  { state: "NY", primary_date: "2026-06-23" },
  { state: "OH", primary_date: "2026-05-05" },
  { state: "OK", primary_date: "2026-06-23" },
  { state: "OR", primary_date: "2026-05-19" },
  { state: "PA", primary_date: "2026-05-19" },
  { state: "RI", primary_date: "2026-09-15" },
  { state: "SC", primary_date: "2026-06-09" },
  { state: "SD", primary_date: "2026-06-02" },
  { state: "TN", primary_date: "2026-08-06" },
  { state: "TX", primary_date: "2026-03-03" },
  { state: "VT", primary_date: "2026-08-11" },
  { state: "WI", primary_date: "2026-08-11" },
  { state: "WY", primary_date: "2026-08-18" },
] as const;

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IA: "Iowa", KS: "Kansas", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NM: "New Mexico", NY: "New York", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", VT: "Vermont", WI: "Wisconsin",
  WY: "Wyoming",
};

async function main() {
  console.log("🗳️  WhyTho 2026 Governor Races seed");
  console.log("=====================================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes");
  console.log();

  // Load existing governors from DB
  const { data: governors } = await supabase
    .from("politicians")
    .select("id, state, full_name")
    .eq("office", "Governor")
    .eq("is_active", true)
    .eq("politician_type", "elected");

  const govByState = new Map<string, string>(); // state → id
  for (const g of governors ?? []) {
    if (g.state) govByState.set(g.state, g.id);
  }

  console.log(`Found ${govByState.size} incumbent governors in DB`);
  console.log();

  let inserted = 0;
  let skipped = 0;

  for (const race of GOV_RACES_2026) {
    const stateName = STATE_NAMES[race.state];
    const raceSlug = `${race.state.toLowerCase()}-governor-primary-2026`;
    const raceName = `${stateName} Governor Primary 2026`;
    const incumbentId = govByState.get(race.state) ?? null;

    if (!incumbentId) {
      console.log(`  ⚠️  No incumbent found for ${race.state} — creating race without incumbent`);
    }

    if (DRY_RUN) {
      console.log(`  [preview] ${raceName} — incumbent: ${incumbentId ? "linked" : "none"} — primary: ${race.primary_date}`);
      continue;
    }

    const { data: existing } = await supabase
      .from("races")
      .select("id")
      .eq("slug", raceSlug)
      .maybeSingle();

    if (existing) {
      console.log(`  ↩️  ${raceName} already exists, skipping`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("races").insert({
      slug: raceSlug,
      name: raceName,
      office: "Governor",
      state: race.state,
      district: null,
      election_date: race.primary_date,
      election_type: "primary",
      party: null,
      incumbent_id: incumbentId,
      status: "active",
    });

    if (error) {
      console.error(`  ❌ Error inserting ${raceName}: ${error.message}`);
      skipped++;
    } else {
      console.log(`  ✅ ${raceName}${incumbentId ? " (incumbent linked)" : ""}`);
      inserted++;
    }
  }

  console.log();
  console.log(`✅ Done. Inserted: ${inserted} | Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
