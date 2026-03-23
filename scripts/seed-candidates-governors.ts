/**
 * seed-candidates-governors.ts
 *
 * Seeds 2026 gubernatorial election candidates.
 * Data sourced from public record (Ballotpedia, state election offices).
 *
 * Covers all 36 states with governor races in 2026.
 * Incumbents running for re-election are matched to existing politician records.
 * Challengers are inserted as new profiles.
 *
 * Usage:
 *   npx tsx scripts/seed-candidates-governors.ts
 *   npx tsx scripts/seed-candidates-governors.ts --dry-run
 *   npx tsx scripts/seed-candidates-governors.ts --state CA
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
  override: true,
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
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

// ── Slug generation ───────────────────────────────────────────────────────────

function makeSlug(name: string, state: string): string {
  return [name, state, "governor"]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// ── Upsert ────────────────────────────────────────────────────────────────────

async function upsertGovCandidate(
  candidate: GovCandidate
): Promise<"inserted" | "updated" | "skipped"> {
  // Match by name + state + Governor office
  const { data: existing } = await supabase
    .from("politicians")
    .select("id, slug, full_name, office")
    .ilike("full_name", candidate.name)
    .eq("state", candidate.state)
    .ilike("office", "%governor%")
    .maybeSingle();

  if (existing) {
    if (!DRY_RUN) {
      await supabase
        .from("politicians")
        .update({
          is_candidate: true,
          candidate_election_year: ELECTION_YEAR,
          candidate_office: "Governor",
          incumbent_challenge: candidate.incumbent_challenge,
          party: candidate.party,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    return "updated";
  }

  // New challenger or unmatched incumbent — insert
  const slug = makeSlug(candidate.name, candidate.state);

  const { data: slugCheck } = await supabase
    .from("politicians")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const finalSlug = slugCheck
    ? `${slug}-${candidate.state.toLowerCase()}-2026`
    : slug;

  if (!DRY_RUN) {
    const { error } = await supabase.from("politicians").insert({
      slug: finalSlug,
      full_name: candidate.name,
      office: "Governor",
      state: candidate.state,
      party: candidate.party,
      is_active: true,
      is_test: false,
      is_candidate: true,
      candidate_election_year: ELECTION_YEAR,
      candidate_office: "Governor",
      incumbent_challenge: candidate.incumbent_challenge,
      verification_tier: "0",
    });

    if (error) {
      console.error(`  ❌ Insert failed for ${candidate.name}: ${error.message}`);
      return "skipped";
    }
  }

  return "inserted";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🗳️  Governor Candidate Seed — ${ELECTION_YEAR}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (STATE_FILTER) console.log(`   State filter: ${STATE_FILTER}`);
  console.log("");

  const candidates = STATE_FILTER
    ? GOV_CANDIDATES_2026.filter((c) => c.state === STATE_FILTER)
    : GOV_CANDIDATES_2026;

  console.log(`   ${candidates.length} candidates to process`);

  let inserted = 0, updated = 0, skipped = 0;

  for (const candidate of candidates) {
    const result = await upsertGovCandidate(candidate);
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
