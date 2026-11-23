/**
 * seed-candidates-governors.ts
 *
 * Seeds 2026 gubernatorial election candidates.
 * Data sourced from public record (Ballotpedia, state election offices).
 *
 * Covers all 36 states with governor races in 2026.
 * The historical built-in list is preview-only. Apply requires a reviewed JSON
 * manifest with stable external_id, source_url, reviewed_at and announced:true.
 * Identity matches are resolved transactionally; name-only matches need review.
 *
 * Usage:
 *   npx tsx scripts/seed-candidates-governors.ts         # read-only preview
 *   npx tsx scripts/seed-candidates-governors.ts --apply --reviewed-candidates=reviewed.json
 *   npx tsx scripts/seed-candidates-governors.ts --dry-run
 *   npx tsx scripts/seed-candidates-governors.ts --state CA
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { readFileSync } from "node:fs";
import type { Database } from "../types/database";
import { importCivicObservation, shouldApplyImport } from "../lib/civic/import-observation";
import { normalizeStateCode } from "../lib/civic/normalize";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
  override: true,
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

const APPLY = shouldApplyImport(process.argv.slice(2));
const DRY_RUN = !APPLY;
const MANIFEST_PATH = process.argv.find((arg) => arg.startsWith("--reviewed-candidates="))?.slice("--reviewed-candidates=".length);
const STATE_FILTER = (() => {
  const idx = process.argv.indexOf("--state");
  return idx !== -1 ? process.argv[idx + 1]?.toUpperCase() : null;
})();
const ELECTION_YEAR = 2026;

// ── 2026 Governor Races ───────────────────────────────────────────────────────
// Source: Ballotpedia "2026 gubernatorial elections"
// incumbent_challenge: I = incumbent running, C = challenger, O = open seat (term limited)
// party: Democrat, Republican, Independent, etc.
// Note: This list will grow as candidates announce. Add challengers here over time.

interface GovCandidate {
  name: string;
  state: string;       // 2-letter code
  party: string;
  incumbent_challenge: "I" | "C" | "O";
  announced?: boolean; // false = likely running but not officially announced
  external_id?: string;
  source_url?: string;
  reviewed_at?: string;
}

const GOV_CANDIDATES_2026: GovCandidate[] = [
  // Alabama — open seat (Ivey term-limited)
  // No major announced candidates yet as of March 2026

  // Alaska
  { name: "Mike Dunleavy", state: "AK", party: "Republican", incumbent_challenge: "I" },

  // Arizona
  { name: "Katie Hobbs", state: "AZ", party: "Democrat", incumbent_challenge: "I" },

  // Arkansas — open seat (Sanders eligible but term structure TBD)
  { name: "Sarah Huckabee Sanders", state: "AR", party: "Republican", incumbent_challenge: "I" },

  // California
  { name: "Gavin Newsom", state: "CA", party: "Democrat", incumbent_challenge: "I" },

  // Colorado
  { name: "Jared Polis", state: "CO", party: "Democrat", incumbent_challenge: "I" },

  // Connecticut
  { name: "Ned Lamont", state: "CT", party: "Democrat", incumbent_challenge: "I" },

  // Florida — open seat (DeSantis term-limited)
  // Candidates TBD

  // Georgia
  { name: "Brian Kemp", state: "GA", party: "Republican", incumbent_challenge: "I" },

  // Hawaii
  { name: "Josh Green", state: "HI", party: "Democrat", incumbent_challenge: "I" },

  // Idaho
  { name: "Brad Little", state: "ID", party: "Republican", incumbent_challenge: "I" },

  // Illinois
  { name: "JB Pritzker", state: "IL", party: "Democrat", incumbent_challenge: "I" },

  // Iowa
  { name: "Kim Reynolds", state: "IA", party: "Republican", incumbent_challenge: "I" },

  // Kansas
  { name: "Laura Kelly", state: "KS", party: "Democrat", incumbent_challenge: "I" },

  // Maine
  { name: "Janet Mills", state: "ME", party: "Democrat", incumbent_challenge: "I" },

  // Maryland — open seat (Moore eligible)
  { name: "Wes Moore", state: "MD", party: "Democrat", incumbent_challenge: "I" },

  // Massachusetts — open seat (Healey eligible)
  { name: "Maura Healey", state: "MA", party: "Democrat", incumbent_challenge: "I" },

  // Michigan
  { name: "Gretchen Whitmer", state: "MI", party: "Democrat", incumbent_challenge: "I" },

  // Minnesota
  { name: "Tim Walz", state: "MN", party: "Democrat", incumbent_challenge: "I" },

  // Nebraska — open seat (Pillen term-limited)
  // Candidates TBD

  // Nevada
  { name: "Joe Lombardo", state: "NV", party: "Republican", incumbent_challenge: "I" },

  // New Hampshire
  { name: "Kelly Ayotte", state: "NH", party: "Republican", incumbent_challenge: "I" },

  // New Mexico
  { name: "Michelle Lujan Grisham", state: "NM", party: "Democrat", incumbent_challenge: "I" },

  // New York
  { name: "Kathy Hochul", state: "NY", party: "Democrat", incumbent_challenge: "I" },

  // Ohio — open seat (DeWine term-limited)
  // Candidates TBD

  // Oklahoma
  { name: "Kevin Stitt", state: "OK", party: "Republican", incumbent_challenge: "I" },

  // Oregon
  { name: "Tina Kotek", state: "OR", party: "Democrat", incumbent_challenge: "I" },

  // Pennsylvania
  { name: "Josh Shapiro", state: "PA", party: "Democrat", incumbent_challenge: "I" },

  // Rhode Island
  { name: "Dan McKee", state: "RI", party: "Democrat", incumbent_challenge: "I" },

  // South Carolina
  { name: "Henry McMaster", state: "SC", party: "Republican", incumbent_challenge: "I" },

  // South Dakota
  { name: "Kristi Noem", state: "SD", party: "Republican", incumbent_challenge: "I" },

  // Tennessee — open seat (Lee term-limited)
  // Candidates TBD

  // Texas
  { name: "Greg Abbott", state: "TX", party: "Republican", incumbent_challenge: "I" },

  // Vermont
  { name: "Phil Scott", state: "VT", party: "Republican", incumbent_challenge: "I" },

  // Wisconsin
  { name: "Tony Evers", state: "WI", party: "Democrat", incumbent_challenge: "I" },

  // Wyoming
  { name: "Mark Gordon", state: "WY", party: "Republican", incumbent_challenge: "I" },
];

function loadCandidates(): GovCandidate[] {
  if (!MANIFEST_PATH) {
    if (APPLY) throw new Error("Built-in governor candidates are unreviewed. --apply requires --reviewed-candidates=path.json");
    console.log("Historical built-in candidate list: discovery preview only; no candidacy is verified.");
    return GOV_CANDIDATES_2026;
  }
  const rows: unknown = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (!Array.isArray(rows)) throw new Error("Reviewed candidate manifest must be a JSON array");
  const ids = new Set<string>();
  return rows.map((value: unknown) => {
    const row = value as GovCandidate;
    if (!row || typeof row.name !== "string" || !row.name.trim() ||
        typeof row.state !== "string" || typeof row.party !== "string" || !row.party.trim() ||
        !["I", "C", "O"].includes(row.incumbent_challenge) || row.announced !== true ||
        typeof row.external_id !== "string" || !row.external_id.trim() ||
        typeof row.source_url !== "string" || !/^https:\/\//.test(row.source_url) ||
        typeof row.reviewed_at !== "string" || !Number.isFinite(Date.parse(row.reviewed_at))) {
      throw new Error("Each reviewed candidate requires name, state, party, incumbent_challenge, announced:true, external_id, source_url and reviewed_at");
    }
    const externalId = row.external_id.trim();
    if (ids.has(externalId)) throw new Error(`Repeated governor provider ID in manifest: ${externalId}`);
    ids.add(externalId);
    return { ...row, state: normalizeStateCode(row.state), external_id: externalId };
  });
}

async function upsertGovCandidate(candidate: GovCandidate): Promise<"inserted" | "updated" | "skipped"> {
  const state = normalizeStateCode(candidate.state);
  const result = await importCivicObservation(supabase, {
    namespace: "reviewed.governor",
    externalId: candidate.external_id ?? `unreviewed:${state}:${candidate.name.toLowerCase()}`,
    sourceUrl: candidate.source_url ?? null,
    record: {
      full_name: candidate.name,
      state,
      office: "Governor",
      party: candidate.party,
      is_candidate: true,
      candidate_election_year: ELECTION_YEAR,
      candidate_office: "Governor",
      incumbent_challenge: candidate.incumbent_challenge,
    },
  }, APPLY);
  if (result.status === "review_required") {
    console.warn(`  Review required for ${candidate.name}: ${result.reason}`);
    return "skipped";
  }
  return result.status === "matched" ? "updated" : "inserted";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🗳️  Governor Candidate Seed — ${ELECTION_YEAR}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (STATE_FILTER) console.log(`   State filter: ${STATE_FILTER}`);
  console.log("");

  const sourceCandidates = loadCandidates();
  const candidates = STATE_FILTER
    ? sourceCandidates.filter((c) => c.state === normalizeStateCode(STATE_FILTER))
    : sourceCandidates;

  console.log(`   ${candidates.length} candidates to process`);

  let inserted = 0, updated = 0, skipped = 0;

  for (const candidate of candidates) {
    let result: "inserted" | "updated" | "skipped";
    try {
      result = await upsertGovCandidate(candidate);
    } catch (error) {
      console.error(`Import failed for ${candidate.name}:`, error);
      process.exitCode = 1;
      result = "skipped";
    }
    const icon = result === "inserted" ? "+" : result === "updated" ? "~" : "·";
    console.log(`  ${icon} ${candidate.name} (${candidate.state}) — ${result}`);
    if (result === "inserted") inserted++;
    else if (result === "updated") updated++;
    else skipped++;

    await new Promise((r) => setTimeout(r, 30));
  }

  console.log(`\n── Summary ─────────────────────────────`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated:  ${updated}`);
  console.log(`   Skipped:  ${skipped}`);
  if (DRY_RUN) console.log(`\n   (dry run — no changes written)`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
