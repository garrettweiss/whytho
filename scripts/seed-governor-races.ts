/**
 * Seed 2026 gubernatorial races
 *
 * 36 states have gubernatorial elections in 2026.
 * This script creates race records and links incumbent governors.
 * Run AFTER governors are in the DB (scripts/seed-governors.ts).
 *
 * Usage:
 *   npx tsx scripts/seed-governor-races.ts               # read-only preview
 *   npx tsx scripts/seed-governor-races.ts --apply --reviewed-races=reviewed.json
 *
 * Reviewed manifest: [{state, primary_date, source_url, reviewed_at}].
 * Built-in approximate dates are preview-only. Existing races are preserved.
 *   npx tsx scripts/seed-governor-races.ts --dry-run
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { readFileSync } from "node:fs";
import { findCanonicalIncumbent, shouldApplyImport } from "../lib/civic/import-observation";
import { normalizeStateCode } from "../lib/civic/normalize";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APPLY = shouldApplyImport(process.argv.slice(2));
const DRY_RUN = !APPLY;
const MANIFEST_PATH = process.argv.find((arg) => arg.startsWith("--reviewed-races="))?.slice("--reviewed-races=".length);

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

type ReviewedRace = { state: string; primary_date: string; source_url?: string; reviewed_at?: string };

function loadRaces(): ReviewedRace[] {
  if (!MANIFEST_PATH) {
    if (APPLY) throw new Error("Approximate race dates cannot be applied. --apply requires --reviewed-races=path.json");
    return [...GOV_RACES_2026];
  }
  const rows: unknown = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (!Array.isArray(rows)) throw new Error("Reviewed race manifest must be a JSON array");
  const states = new Set<string>();
  return rows.map((value: unknown) => {
    const row = value as ReviewedRace;
    if (!row || typeof row.state !== "string" || typeof row.primary_date !== "string" ||
        !/^2026-\d{2}-\d{2}$/.test(row.primary_date) || !Number.isFinite(Date.parse(row.primary_date)) ||
        typeof row.source_url !== "string" || !/^https:\/\//.test(row.source_url) ||
        typeof row.reviewed_at !== "string" || !Number.isFinite(Date.parse(row.reviewed_at))) {
      throw new Error("Each reviewed race requires state, a 2026 primary_date, source_url and reviewed_at");
    }
    const state = normalizeStateCode(row.state);
    if (!STATE_NAMES[state] || states.has(state)) throw new Error(`Unexpected or repeated race state: ${state}`);
    states.add(state);
    return { ...row, state };
  });
}

async function main() {
  console.log("WhyTho 2026 Governor Races seed");
  console.log(APPLY ? "Mode: APPLY" : "Mode: DRY RUN (no writes); pass --apply with a reviewed manifest to write");
  const races = loadRaces();
  let inserted = 0;
  let skipped = 0;

  for (const race of races) {
    const raceSlug = `${race.state.toLowerCase()}-governor-primary-2026`;
    const raceName = `${STATE_NAMES[race.state]} Governor Primary 2026`;
    try {
      const { data: existing, error: lookupError } = await supabase.from("races")
        .select("id").eq("slug", raceSlug).maybeSingle();
      if (lookupError) throw new Error(`Race lookup failed: ${lookupError.message}`);
      if (existing) {
        console.log(`  ${raceName} already exists, preserving its history`);
        skipped++;
        continue;
      }
      const incumbentId = await findCanonicalIncumbent(supabase, "Governor", race.state);
      if (DRY_RUN) {
        console.log(`  [preview] ${raceName}; incumbent: ${incumbentId ?? "none"}; primary: ${race.primary_date}`);
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
      if (error) throw new Error(`Race insert failed: ${error.message}`);
      inserted++;
      console.log(`  Created ${raceName}; reviewed source: ${race.source_url}`);
    } catch (error) {
      console.error(`  Skipping ${raceName}:`, error);
      process.exitCode = 1;
      skipped++;
    }
  }
  console.log(`Done. Inserted: ${inserted} | Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
