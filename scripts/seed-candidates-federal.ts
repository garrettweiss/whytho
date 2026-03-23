/**
 * seed-candidates-federal.ts
 *
 * Ingests 2026 federal election candidates from the FEC API.
 * Covers: U.S. House, U.S. Senate, President.
 *
 * Dedup order:
 *   1. candidate_fec_id match → update existing record
 *   2. Normalized name + state + office match → update existing record
 *   3. No match → insert new politician record
 *
 * Usage:
 *   npx tsx scripts/seed-candidates-federal.ts
 *   npx tsx scripts/seed-candidates-federal.ts --dry-run
 *   npx tsx scripts/seed-candidates-federal.ts --office S    (Senate only)
 *   npx tsx scripts/seed-candidates-federal.ts --office H    (House only)
 *   npx tsx scripts/seed-candidates-federal.ts --office P    (President only)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
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

// ── Name normalization ────────────────────────────────────────────────────────

/** Convert "SMITH, JOHN A" → "John A. Smith" */
function normalizeFecName(raw: string): string {
  const comma = raw.indexOf(",");
  if (comma === -1) return toTitleCase(raw.trim());
  const last = raw.slice(0, comma).trim();
  const rest = raw.slice(comma + 1).trim();
  const parts = rest.split(/\s+/).map((p, i) => {
    // Single letters become initials with period
    if (p.length === 1) return i === 0 ? p + "." : p + ".";
    return toTitleCase(p);
  });
  return `${parts.join(" ")} ${toTitleCase(last)}`.trim();
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Party normalization ───────────────────────────────────────────────────────

const PARTY_MAP: Record<string, string> = {
  DEM: "Democrat",
  REP: "Republican",
  IND: "Independent",
  LIB: "Libertarian",
  GRE: "Green",
  CON: "Constitution",
  NNE: "No Party",
  UNK: "Unknown",
};

function normalizeParty(raw: string | null): string | null {
  if (!raw) return null;
  return PARTY_MAP[raw.toUpperCase()] ?? raw;
}

// ── Office normalization ──────────────────────────────────────────────────────

function officeLabel(fec: FecCandidate): string {
  if (fec.office === "P") return "President";
  if (fec.office === "S") return "U.S. Senator";
  if (fec.office === "H") {
    const dist = fec.district ? parseInt(fec.district, 10) : null;
    return dist ? `U.S. Representative` : "U.S. Representative";
  }
  return fec.office;
}

// ── Slug generation ───────────────────────────────────────────────────────────

function makeSlug(name: string, state: string, office: string, district: string | null): string {
  const base = [name, state, office === "U.S. Senator" ? "senator" : office === "President" ? "president" : district ? `district-${parseInt(district, 10)}` : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return base;
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
  if (!fec.name) return "skipped"; // FEC occasionally returns null names
  const name = normalizeFecName(fec.name);
  const party = normalizeParty(fec.party);
  const office = officeLabel(fec);
  const state = fec.office === "P" ? "DC" : fec.state;

  // 1. Check by FEC candidate ID
  const { data: byFecId } = await supabase
    .from("politicians")
    .select("id, slug, full_name")
    .eq("candidate_fec_id", fec.candidate_id)
    .maybeSingle();

  if (byFecId) {
    if (!DRY_RUN) {
      await supabase
        .from("politicians")
        .update({
          is_candidate: true,
          candidate_election_year: ELECTION_YEAR,
          candidate_office: office,
          incumbent_challenge: fec.incumbent_challenge ?? null,
          party,
          updated_at: new Date().toISOString(),
        })
        .eq("id", byFecId.id);
    }
    return "updated";
  }

  // 2. Check by normalized name + state + office type
  const { data: byName } = await supabase
    .from("politicians")
    .select("id, slug, full_name")
    .ilike("full_name", name)
    .eq("state", state)
    .ilike("office", `%${fec.office === "S" ? "Senator" : fec.office === "H" ? "Representative" : "President"}%`)
    .maybeSingle();

  if (byName) {
    if (!DRY_RUN) {
      await supabase
        .from("politicians")
        .update({
          is_candidate: true,
          candidate_election_year: ELECTION_YEAR,
          candidate_office: office,
          candidate_fec_id: fec.candidate_id,
          incumbent_challenge: fec.incumbent_challenge ?? null,
          party,
          updated_at: new Date().toISOString(),
        })
        .eq("id", byName.id);
    }
    return "updated";
  }

  // 3. New candidate — insert
  const slug = makeSlug(name, state, office, fec.district);

  // Check slug collision
  const { data: slugCheck } = await supabase
    .from("politicians")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const finalSlug = slugCheck ? `${slug}-${fec.candidate_id.toLowerCase()}` : slug;

  if (!DRY_RUN) {
    const { error } = await supabase.from("politicians").insert({
      slug: finalSlug,
      full_name: name,
      office,
      state,
      district: fec.district ? parseInt(fec.district, 10) : null,
      party,
      is_active: true,
      is_test: false,
      is_candidate: true,
      candidate_election_year: ELECTION_YEAR,
      candidate_office: office,
      candidate_fec_id: fec.candidate_id,
      incumbent_challenge: fec.incumbent_challenge ?? null,
      verification_tier: "0",
    });

    if (error) {
      console.error(`    ❌ Insert failed for ${name}: ${error.message}`);
      return "skipped";
    }
  }

  return "inserted";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🗳️  FEC Candidate Ingestion — ${ELECTION_YEAR}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (OFFICE_FILTER) console.log(`   Office filter: ${OFFICE_FILTER}`);
  console.log("");

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
      continue;
    }

    console.log(`  ${candidates.length} candidates fetched from FEC`);

    let inserted = 0, updated = 0, skipped = 0;

    for (const candidate of candidates) {
      const result = await upsertCandidate(candidate);
      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else skipped++;

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
