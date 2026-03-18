/**
 * Ingest 2026 federal candidates from FEC API
 *
 * Fetches House + Senate candidates registered with the FEC for the 2026 election cycle.
 * Creates candidate records in politicians table with politician_type='candidate'
 * and links them to races.
 *
 * Usage:
 *   npx tsx scripts/ingest-fec-candidates.ts
 *   npx tsx scripts/ingest-fec-candidates.ts --office=S   # Senate only
 *   npx tsx scripts/ingest-fec-candidates.ts --office=H   # House only
 *   npx tsx scripts/ingest-fec-candidates.ts --state=CO   # One state
 *   npx tsx scripts/ingest-fec-candidates.ts --dry-run    # Preview only
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FEC_BASE = "https://api.open.fec.gov/v1";
const FEC_API_KEY = process.env.FEC_API_KEY ?? "DEMO_KEY"; // DEMO_KEY = 1000 req/day

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
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

function mapParty(fecParty: string): string {
  const p = fecParty.toUpperCase();
  if (p === "DEM") return "Democrat";
  if (p === "REP") return "Republican";
  if (p === "IND") return "Independent";
  if (p === "GRE") return "Green";
  if (p === "LIB") return "Libertarian";
  return fecParty;
}

function mapOffice(fecOffice: string): string {
  if (fecOffice === "H") return "U.S. Representative";
  if (fecOffice === "S") return "U.S. Senator";
  return fecOffice;
}

function toTitleCase(name: string): string {
  // FEC names come as "LAST, FIRST MIDDLE" — convert to "First Last"
  const parts = name.split(",");
  if (parts.length >= 2) {
    const last = parts[0]!.trim();
    const first = parts[1]!.trim().split(" ")[0] ?? "";
    const lastName = last.split(" ").map(w =>
      w.length <= 2 && /^[A-Z]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(" ");
    const firstName = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    return `${firstName} ${lastName}`.trim();
  }
  return name.split(" ").map((w) =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(" ");
}

function buildSlug(name: string, state: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${normalized}-${state.toLowerCase()}-candidate-2026`;
}

async function ensureRace(
  office: "U.S. Senator" | "U.S. Representative",
  state: string,
  district: string | null,
  party: string | null
): Promise<string> {
  // Build race slug
  const raceName =
    office === "U.S. Senator"
      ? `${state} U.S. Senate Primary 2026`
      : `${state}-${district ?? "??"} U.S. House Primary 2026`;

  const raceSlug =
    office === "U.S. Senator"
      ? `${state.toLowerCase()}-senate-primary-2026`
      : `${state.toLowerCase()}-house-${(district ?? "xx").padStart(2, "0")}-primary-2026`;

  // Find incumbent
  const { data: incumbent } = await supabase
    .from("politicians")
    .select("id")
    .eq("office", office)
    .eq("state", state)
    .eq("is_active", true)
    .eq("politician_type", "elected")
    .maybeSingle();

  const { data: existing } = await supabase
    .from("races")
    .select("id")
    .eq("slug", raceSlug)
    .maybeSingle();

  if (existing) return existing.id;

  // Create race
  const { data: newRace, error } = await supabase
    .from("races")
    .insert({
      slug: raceSlug,
      name: raceName,
      office,
      state,
      district,
      election_date: "2026-06-30", // placeholder — update per state
      election_type: "primary",
      party,
      incumbent_id: incumbent?.id ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create race ${raceSlug}: ${error.message}`);
  return newRace.id;
}

async function upsertCandidate(
  fec: FECCandidate,
  raceId: string
): Promise<{ action: "inserted" | "updated" | "skipped"; name: string }> {
  const fullName = toTitleCase(fec.name);
  const slug = buildSlug(fullName, fec.state);
  const office = mapOffice(fec.office);
  const party = mapParty(fec.party);
  const district = fec.district ? fec.district.padStart(2, "0") : null;

  // Check if this person is already in DB as elected official
  const { data: existingElected } = await supabase
    .from("politicians")
    .select("id, politician_type")
    .eq("fec_candidate_id", fec.candidate_id)
    .maybeSingle();

  if (existingElected && existingElected.politician_type === "elected") {
    // Incumbent running for re-election — just link to race, don't create duplicate
    await supabase
      .from("politicians")
      .update({ race_id: raceId })
      .eq("id", existingElected.id);
    return { action: "updated", name: fullName };
  }

  // Check if candidate already exists by slug
  const { data: existingBySlug } = await supabase
    .from("politicians")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const candidateData = {
    full_name: fullName,
    slug,
    party,
    office,
    state: fec.state,
    district,
    politician_type: "candidate",
    candidate_status: "active",
    fec_candidate_id: fec.candidate_id,
    race_id: raceId,
    is_active: true,
    verification_tier: "0" as const,
  };

  if (existingBySlug) {
    await supabase.from("politicians").update(candidateData).eq("id", existingBySlug.id);
    return { action: "updated", name: fullName };
  }

  const { error } = await supabase.from("politicians").insert(candidateData);
  if (error) {
    console.error(`  Error inserting ${fullName}: ${error.message}`);
    return { action: "skipped", name: fullName };
  }
  return { action: "inserted", name: fullName };
}

async function main() {
  console.log("🗳️  WhyTho FEC candidate ingest");
  console.log("================================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes");
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

    if (DRY_RUN) {
      const preview = candidates.slice(0, 5);
      for (const c of preview) {
        console.log(`  [preview] ${toTitleCase(c.name)} (${c.state}${c.district ? `-${c.district}` : ""}) ${c.party}`);
      }
      if (candidates.length > 5) console.log(`  ... and ${candidates.length - 5} more`);
      continue;
    }

    // Group by race (state + district for House, state for Senate)
    const raceCache = new Map<string, string>();

    for (const fec of candidates) {
      const officeLabel = mapOffice(fec.office) as "U.S. Senator" | "U.S. Representative";
      const district = fec.district ? fec.district.padStart(2, "0") : null;
      const cacheKey = `${fec.state}-${fec.office}-${district ?? ""}`;

      if (!raceCache.has(cacheKey)) {
        try {
          const raceId = await ensureRace(officeLabel, fec.state, district, null);
          raceCache.set(cacheKey, raceId);
        } catch (err) {
          console.error(`  Error creating race for ${fec.state} ${officeLabel}: ${err}`);
          totalSkipped++;
          continue;
        }
      }

      const raceId = raceCache.get(cacheKey)!;
      const result = await upsertCandidate(fec, raceId);
      if (result.action === "inserted") totalInserted++;
      else if (result.action === "updated") totalUpdated++;
      else totalSkipped++;

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
