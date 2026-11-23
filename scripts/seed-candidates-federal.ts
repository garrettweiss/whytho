/**
 * seed-candidates-federal.ts
 *
 * Ingests 2026 federal election candidates from the FEC API.
 * Covers: U.S. House, U.S. Senate, President.
 *
 * Uses the shared transactional provider identity resolver. Name-only matches
 * require review. Existing profile slugs, claims and portraits are preserved.
 *
 * Usage:
 *   npx tsx scripts/seed-candidates-federal.ts           # read-only preview
 *   npx tsx scripts/seed-candidates-federal.ts --apply   # explicit writes
 *   npx tsx scripts/seed-candidates-federal.ts --dry-run
 *   npx tsx scripts/seed-candidates-federal.ts --office S    (Senate only)
 *   npx tsx scripts/seed-candidates-federal.ts --office H    (House only)
 *   npx tsx scripts/seed-candidates-federal.ts --office P    (President only)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import type { Database } from "../types/database";
import { fecObservation, importCivicObservation, shouldApplyImport } from "../lib/civic/import-observation";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
  override: true,
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FEC_API_KEY = process.env.FEC_API_KEY;

if (!FEC_API_KEY) {
  console.error("❌ FEC_API_KEY not set in .env.local");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

const APPLY = shouldApplyImport(process.argv.slice(2));
const DRY_RUN = !APPLY;
const OFFICE_FILTER = (() => {
  const idx = process.argv.indexOf("--office");
  return idx !== -1 ? process.argv[idx + 1]?.toUpperCase() : null;
})();
const ELECTION_YEAR = 2026;

// ── FEC Types ────────────────────────────────────────────────────────────────

interface FecCandidate {
  candidate_id: string;       // "H0CO08040"
  name: string | null;        // "EVANS, GABE" — null possible from FEC
  office: "H" | "S" | "P";   // House / Senate / President
  state: string;              // "CO"
  district: string | null;    // "08" for House, null for Senate/President
  party: string | null;       // "REP", "DEM", "IND", etc. — null possible from FEC
  incumbent_challenge: "I" | "C" | "O" | null;
  election_years: number[];
}

interface FecResponse {
  results: FecCandidate[];
  pagination: {
    count: number;
    page: number;
    pages: number;
    per_page: number;
  };
}

// ── FEC fetching ─────────────────────────────────────────────────────────────

async function fetchFecCandidates(office: "H" | "S" | "P"): Promise<FecCandidate[]> {
  const all: FecCandidate[] = [];
  let page = 1;

  while (true) {
    const url = new URL("https://api.open.fec.gov/v1/candidates/");
    url.searchParams.set("api_key", FEC_API_KEY!);
    url.searchParams.set("election_year", String(ELECTION_YEAR));
    url.searchParams.set("office", office);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "name");
    url.searchParams.set("is_active_candidate", "true");

    console.log(`  Fetching ${office} page ${page}…`);
    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FEC API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as FecResponse;
    all.push(...data.results);

    if (page >= data.pagination.pages) break;
    page++;

    // FEC rate limit: 120 requests/minute
    await new Promise((r) => setTimeout(r, 550));
  }

  return all;
}

// ── Upsert logic ─────────────────────────────────────────────────────────────

interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

async function upsertCandidate(fec: FecCandidate): Promise<"inserted" | "updated" | "skipped"> {
  if (!fec.name?.trim()) return "skipped";
  const result = await importCivicObservation(supabase, fecObservation(fec, ELECTION_YEAR), APPLY);
  if (result.status === "review_required") {
    console.warn(`    Review required for ${fec.name}: ${result.reason}`);
    return "skipped";
  }
  return result.status === "matched" ? "updated" : "inserted";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🗳️  FEC Candidate Ingestion — ${ELECTION_YEAR}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (OFFICE_FILTER) console.log(`   Office filter: ${OFFICE_FILTER}`);
  console.log("");

  if (OFFICE_FILTER && !["H", "S", "P"].includes(OFFICE_FILTER)) throw new Error("Invalid --office; use H, S or P");
  const offices: ("H" | "S" | "P")[] = OFFICE_FILTER
    ? [OFFICE_FILTER as "H" | "S" | "P"]
    : ["H", "S", "P"];

  const totals: UpsertResult = { inserted: 0, updated: 0, skipped: 0 };

  for (const office of offices) {
    const label = office === "H" ? "U.S. House" : office === "S" ? "U.S. Senate" : "President";
    console.log(`\n── ${label} ─────────────────────`);

    let candidates: FecCandidate[];
    try {
      candidates = await fetchFecCandidates(office);
    } catch (err) {
      console.error(`  ❌ Failed to fetch ${label}: ${err}`);
      process.exitCode = 1;
      continue;
    }

    console.log(`  ${candidates.length} candidates fetched from FEC`);

    let inserted = 0, updated = 0, skipped = 0;

    for (const candidate of candidates) {
      try {
        const result = await upsertCandidate(candidate);
        if (result === "inserted") inserted++;
        else if (result === "updated") updated++;
        else skipped++;
      } catch (error) {
        console.error(`    Import failed for ${candidate.name}:`, error);
        process.exitCode = 1;
        skipped++;
      }

      // Small delay to avoid hammering Supabase
      await new Promise((r) => setTimeout(r, 20));
    }

    console.log(`  ✓ ${label}: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
    totals.inserted += inserted;
    totals.updated += updated;
    totals.skipped += skipped;
  }

  console.log(`\n── Summary ─────────────────────────────`);
  console.log(`   Inserted: ${totals.inserted}`);
  console.log(`   Updated:  ${totals.updated}`);
  console.log(`   Skipped:  ${totals.skipped}`);
  console.log(`   Total:    ${totals.inserted + totals.updated + totals.skipped}`);
  if (DRY_RUN) console.log(`\n   (dry run — no changes written)`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
