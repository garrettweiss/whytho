/**
 * Ingest 2026 federal candidates from FEC API
 *
 * Fetches House + Senate candidates registered with the FEC for the 2026 election cycle.
 * Resolves candidates through the shared provider identity registry and retains
 * dated candidacy observations. Links existing races without fabricating dates.
 *
 * Usage:
 *   npx tsx scripts/ingest-fec-candidates.ts             # read-only preview
 *   npx tsx scripts/ingest-fec-candidates.ts --apply     # explicit writes
 *   npx tsx scripts/ingest-fec-candidates.ts --office=S   # Senate only
 *   npx tsx scripts/ingest-fec-candidates.ts --office=H   # House only
 *   npx tsx scripts/ingest-fec-candidates.ts --state=CO   # One state
 *   npx tsx scripts/ingest-fec-candidates.ts --dry-run    # Preview only
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { fecObservation, findExistingFederalRace, importCivicObservation, shouldApplyImport } from "../lib/civic/import-observation";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FEC_BASE = "https://api.open.fec.gov/v1";
const FEC_API_KEY = process.env.FEC_API_KEY ?? "DEMO_KEY"; // DEMO_KEY = 1000 req/day

// Parse CLI args
const args = process.argv.slice(2);
const APPLY = shouldApplyImport(args);
const DRY_RUN = !APPLY;
const OFFICE_ARG = args.find((a) => a.startsWith("--office="))?.split("=")[1]?.toUpperCase();
const STATE_ARG = args.find((a) => a.startsWith("--state="))?.split("=")[1]?.toUpperCase();

const OFFICES = OFFICE_ARG
  ? [OFFICE_ARG as "H" | "S"]
  : (["H", "S"] as const);

interface FECCandidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string; // H=House, S=Senate, P=President
  state: string;
  district: string | null;
  incumbent_challenge: string; // I=incumbent, C=challenger, O=open seat
  election_years: number[];
  candidate_status: string; // C=candidate, F=future_cand, N=not_yet_a_cand, P=prior_cand
}

interface FECResponse {
  results: FECCandidate[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    count: number;
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFECPage(
  office: "H" | "S",
  page: number,
  state?: string
): Promise<FECResponse> {
  const params = new URLSearchParams({
    api_key: FEC_API_KEY,
    election_year: "2026",
    office,
    is_active_candidate: "true",
    per_page: "100",
    page: String(page),
    sort: "name",
  });
  if (state) params.set("state", state);

  const url = `${FEC_BASE}/candidates/?${params}`;
  const res = await fetch(url);

  if (res.status === 429) {
    console.log("  ⏳ FEC rate limited, waiting 10s...");
    await sleep(10000);
    return fetchFECPage(office, page, state);
  }

  if (!res.ok) {
    throw new Error(`FEC API error ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<FECResponse>;
}

async function fetchAllFECCandidates(
  office: "H" | "S",
  state?: string
): Promise<FECCandidate[]> {
  const all: FECCandidate[] = [];
  let page = 1;

  while (true) {
    const data = await fetchFECPage(office, page, state);
    all.push(...data.results);
    if (page >= data.pagination.pages) break;
    page++;
    await sleep(500);
  }

  return all;
}

async function upsertCandidate(fec: FECCandidate): Promise<"inserted" | "updated" | "skipped"> {
  const observation = fecObservation(fec, 2026);
  observation.record.race_id = await findExistingFederalRace(supabase, observation, 2026);
  const result = await importCivicObservation(supabase, observation, APPLY);
  if (result.status === "review_required") {
    console.warn(`  Review required for ${observation.record.full_name}: ${result.reason}`);
    return "skipped";
  }
  return result.status === "matched" ? "updated" : "inserted";
}

async function main() {
  console.log("🗳️  WhyTho FEC candidate ingest");
  console.log("================================");
  if (DRY_RUN) console.log("DRY RUN: no writes; pass --apply to write");
  if (OFFICE_ARG && !["H", "S"].includes(OFFICE_ARG)) throw new Error("Invalid --office; use H or S");
  console.log(`Offices: ${OFFICES.join(", ")} | Year: 2026`);
  if (STATE_ARG) console.log(`State filter: ${STATE_ARG}`);
  console.log();

  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const office of OFFICES) {
    console.log(`📋 Fetching ${office === "H" ? "House" : "Senate"} candidates...`);
    const candidates = await fetchAllFECCandidates(office, STATE_ARG);
    console.log(`  → ${candidates.length} fetched from FEC`);
    totalFetched += candidates.length;

    for (const fec of candidates) {
      try {
        const result = await upsertCandidate(fec);
        if (result === "inserted") totalInserted++;
        else if (result === "updated") totalUpdated++;
        else totalSkipped++;
      } catch (error) {
        console.error(`  Import failed for ${fec.name}:`, error);
        process.exitCode = 1;
        totalSkipped++;
      }
      await sleep(50);
    }

    console.log(`  ✅ Office ${office} complete`);
    await sleep(1000);
  }

  console.log();
  console.log(`✅ Done. Fetched: ${totalFetched} | Inserted: ${totalInserted} | Updated: ${totalUpdated} | Skipped: ${totalSkipped}`);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
