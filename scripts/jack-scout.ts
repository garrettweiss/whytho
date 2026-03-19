/**
 * Jack — Scout Agent (Handle Discovery)
 *
 * Finds and verifies X handles for federal politicians + governors.
 * Primary source: Congress.gov API (free, no X credits used).
 * Writes verified handles to politicians.social_handles.twitter.
 *
 * Usage:
 *   npx tsx scripts/jack-scout.ts                    # All federal + governors
 *   npx tsx scripts/jack-scout.ts --dry-run          # Preview only, no writes
 *   npx tsx scripts/jack-scout.ts --office=senate    # Senate only
 *   npx tsx scripts/jack-scout.ts --office=house     # House only
 *   npx tsx scripts/jack-scout.ts --office=governors # Governors only (manual seed)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? "DEMO_KEY";
const CONGRESS_BASE = "https://api.congress.gov/v3";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const OFFICE_ARG = args.find((a) => a.startsWith("--office="))?.split("=")[1];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Congress.gov API ──────────────────────────────────────────────────────────

interface CongressMember {
  bioguideId: string;
  name: string;
  state: string;
  district?: number;
  partyName: string;
  terms: {
    item: Array<{ chamber: string; startYear: number; endYear?: number }>;
  };
  officialWebsiteUrl?: string;
}

interface CongressMemberDetail {
  bioguideId: string;
  directOrderName: string;
  officialWebsiteUrl?: string;
  addressInformation?: {
    officeTelephone?: string;
  };
  identifiers?: {
    bioguideId?: string;
    lisId?: string;
    gpoId?: string;
  };
  // Note: Congress.gov API v3 includes social media in some endpoints
  contactInfo?: Record<string, string>;
}

async function fetchCongressMembers(chamber: "senate" | "house"): Promise<CongressMember[]> {
  const all: CongressMember[] = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const url = `${CONGRESS_BASE}/member?currentMember=true&limit=${limit}&offset=${offset}&api_key=${CONGRESS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Congress API error: ${res.status}`);

    const data = await res.json() as {
      members: CongressMember[];
      pagination: { count: number; total: number };
    };

    // Filter by chamber
    const filtered = data.members.filter((m) => {
      const latestTerm = m.terms?.item?.[m.terms.item.length - 1];
      if (!latestTerm) return false;
      if (chamber === "senate") return latestTerm.chamber === "Senate";
      if (chamber === "house") return latestTerm.chamber === "House of Representatives";
      return false;
    });

    all.push(...filtered);

    if (offset + limit >= data.pagination.total) break;
    offset += limit;
    await sleep(200);
  }

  return all;
}

async function fetchMemberSocialHandles(bioguideId: string): Promise<string | null> {
  // Congress.gov member detail sometimes includes social links
  // Primary method: check if officialWebsiteUrl contains twitter handle pattern
  // Secondary: use the /member/{bioguideId} endpoint
  try {
    const url = `${CONGRESS_BASE}/member/${bioguideId}?api_key=${CONGRESS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json() as { member?: CongressMemberDetail & { twitterAccount?: string; youtubeAccount?: string } };
    const member = data.member;
    if (!member) return null;

    // Congress.gov sometimes exposes twitter handle directly
    if ((member as Record<string, unknown>).twitterAccount) {
      return (member as Record<string, unknown>).twitterAccount as string;
    }

    return null;
  } catch {
    return null;
  }
}

// ── Database helpers ──────────────────────────────────────────────────────────

async function findPoliticianByBioguide(bioguideId: string) {
  // Our politicians table may have bioguide_id from Congress.gov seeding
  const { data } = await supabase
    .from("politicians")
    .select("id, full_name, social_handles, office, state")
    .eq("bioguide_id", bioguideId)
    .maybeSingle();
  return data;
}

async function findPoliticianByName(name: string, state: string, office: string) {
  // Fuzzy fallback: match by name + state + office
  const { data } = await supabase
    .from("politicians")
    .select("id, full_name, social_handles, office, state")
    .eq("state", state)
    .eq("office", office)
    .ilike("full_name", `%${name.split(",").reverse().join(" ").trim().split(" ")[0]}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

async function updateHandle(
  politicianId: string,
  handle: string,
  confidence: "verified" | "inferred",
  currentHandles: Record<string, string> | null
) {
  if (DRY_RUN) return;

  const updated = {
    ...(currentHandles ?? {}),
    twitter: handle,
    twitter_confidence: confidence,
  };

  await supabase
    .from("politicians")
    .update({ social_handles: updated })
    .eq("id", politicianId);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function scoutChamber(chamber: "senate" | "house") {
  const officeLabel = chamber === "senate" ? "U.S. Senator" : "U.S. Representative";
  console.log(`\n📋 Scouting ${officeLabel}s via Congress.gov...`);

  const members = await fetchCongressMembers(chamber);
  console.log(`  → ${members.length} current members fetched`);

  let found = 0;
  let missing = 0;
  let skipped = 0;

  for (const member of members) {
    // Find in our DB
    const politician =
      await findPoliticianByName(
        member.name,
        member.state,
        officeLabel
      );

    if (!politician) {
      skipped++;
      continue;
    }

    // Check if already has a handle
    const existingHandles = (politician.social_handles ?? {}) as Record<string, string>;
    if (existingHandles.twitter) {
      found++;
      continue;
    }

    // Try to get handle from Congress.gov detail endpoint
    await sleep(150); // polite pacing
    const handle = await fetchMemberSocialHandles(member.bioguideId);

    if (handle) {
      if (DRY_RUN) {
        console.log(`  [preview] ${politician.full_name} → @${handle} (verified)`);
      } else {
        await updateHandle(politician.id, handle, "verified", existingHandles);
        console.log(`  ✅ ${politician.full_name} → @${handle}`);
      }
      found++;
    } else {
      missing++;
    }
  }

  console.log(`  Summary: ${found} found/existing, ${missing} still missing, ${skipped} not in DB`);
  return { found, missing, skipped };
}

async function reportMissingHandles() {
  console.log("\n📊 Current handle coverage in DB...");

  const { data } = await supabase
    .from("politicians")
    .select("office, social_handles")
    .in("office", ["U.S. Senator", "U.S. Representative", "Governor"])
    .eq("is_active", true);

  const summary: Record<string, { total: number; hasHandle: number }> = {};
  for (const p of data ?? []) {
    const office = p.office ?? "Other";
    if (!summary[office]) summary[office] = { total: 0, hasHandle: 0 };
    summary[office]!.total++;
    const handles = (p.social_handles ?? {}) as Record<string, string>;
    if (handles.twitter) summary[office]!.hasHandle++;
  }

  for (const [office, counts] of Object.entries(summary)) {
    const pct = Math.round((counts.hasHandle / counts.total) * 100);
    console.log(`  ${office}: ${counts.hasHandle}/${counts.total} (${pct}%)`);
  }
}

async function main() {
  console.log("🕵️  Jack — Scout Agent");
  console.log("=======================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes\n");

  const chambers: Array<"senate" | "house"> = [];
  if (!OFFICE_ARG || OFFICE_ARG === "senate") chambers.push("senate");
  if (!OFFICE_ARG || OFFICE_ARG === "house") chambers.push("house");

  let totalFound = 0;
  let totalMissing = 0;

  for (const chamber of chambers) {
    const result = await scoutChamber(chamber);
    totalFound += result.found;
    totalMissing += result.missing;
  }

  if (OFFICE_ARG === "governors") {
    console.log("\n⚠️  Governor handles require manual seeding or web scraping.");
    console.log("   Run: npx tsx scripts/jack-scout-governors.ts (coming in P2)");
  }

  await reportMissingHandles();

  console.log(`\n✅ Scout complete. Found/existing: ${totalFound} | Still missing: ${totalMissing}`);
  console.log("\nNext: run jack-test-connection.ts then jack-harvester.ts");
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
