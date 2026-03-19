/**
 * Jack — Governor Handle Seeder
 *
 * Seeds X handles for all 50 governors.
 * Hardcoded from public records — no API needed.
 * Confidence: 'verified' for known handles, 'inferred' for uncertain ones.
 *
 * Usage:
 *   npx tsx scripts/jack-governor-handles.ts             # Write all
 *   npx tsx scripts/jack-governor-handles.ts --dry-run  # Preview only
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

// Governor X handles as of March 2026
// confidence: verified = confirmed from official source / known handle
//             inferred = best known handle, should be spot-checked
const GOVERNOR_HANDLES: Array<{
  state: string;
  name: string;
  twitter: string;
  confidence: "verified" | "inferred";
}> = [
  { state: "AK", name: "Mike Dunleavy",          twitter: "GovDunleavy",           confidence: "verified" },
  { state: "AL", name: "Kay Ivey",               twitter: "GovernorKayIvey",        confidence: "verified" },
  { state: "AR", name: "Sarah Huckabee Sanders", twitter: "SarahHuckSanders",       confidence: "verified" },
  { state: "AZ", name: "Katie Hobbs",            twitter: "GovernorHobbs",          confidence: "verified" },
  { state: "CA", name: "Gavin Newsom",           twitter: "GavinNewsom",            confidence: "verified" },
  { state: "CO", name: "Jared Polis",            twitter: "jaredpolis",             confidence: "verified" },
  { state: "CT", name: "Ned Lamont",             twitter: "GovNedLamont",           confidence: "verified" },
  { state: "DE", name: "Matt Meyer",             twitter: "GovMattMeyer",           confidence: "inferred" },
  { state: "FL", name: "Ron DeSantis",           twitter: "GovRonDeSantis",         confidence: "verified" },
  { state: "GA", name: "Brian Kemp",             twitter: "BrianKempGA",            confidence: "verified" },
  { state: "HI", name: "Josh Green",             twitter: "GovJoshGreenMD",         confidence: "verified" },
  { state: "IA", name: "Kim Reynolds",           twitter: "KimReynoldsIA",          confidence: "verified" },
  { state: "ID", name: "Brad Little",            twitter: "GovernorLittle",         confidence: "verified" },
  { state: "IL", name: "JB Pritzker",            twitter: "GovPritzker",            confidence: "verified" },
  { state: "IL", name: "J. B. Pritzker",         twitter: "GovPritzker",            confidence: "verified" },
  { state: "IN", name: "Mike Braun",             twitter: "GovMikeBraun",           confidence: "verified" },
  { state: "KS", name: "Laura Kelly",            twitter: "GovernorLauraKelly",     confidence: "verified" },
  { state: "KY", name: "Andy Beshear",           twitter: "GovAndyBeshear",         confidence: "verified" },
  { state: "LA", name: "Jeff Landry",            twitter: "JeffLandryLA",           confidence: "verified" },
  { state: "MA", name: "Maura Healey",           twitter: "MassGovernor",           confidence: "verified" },
  { state: "MD", name: "Wes Moore",              twitter: "GovWesMoore",            confidence: "verified" },
  { state: "ME", name: "Janet Mills",            twitter: "GovJanetMills",          confidence: "verified" },
  { state: "MI", name: "Gretchen Whitmer",       twitter: "GovWhitmer",             confidence: "verified" },
  { state: "MN", name: "Tim Walz",               twitter: "GovTimWalz",             confidence: "verified" },
  { state: "MO", name: "Mike Kehoe",             twitter: "GovMikeKehoe",           confidence: "inferred" },
  { state: "MS", name: "Tate Reeves",            twitter: "TateReeves",             confidence: "verified" },
  { state: "MT", name: "Greg Gianforte",         twitter: "GovGianforte",           confidence: "verified" },
  { state: "NC", name: "Josh Stein",             twitter: "GovJoshStein",           confidence: "verified" },
  { state: "ND", name: "Kelly Armstrong",        twitter: "GovArmstrongND",         confidence: "inferred" },
  { state: "NE", name: "Jim Pillen",             twitter: "GovPillen",              confidence: "verified" },
  { state: "NH", name: "Kelly Ayotte",           twitter: "GovernorAyotte",         confidence: "inferred" },
  { state: "NJ", name: "Mikie Sherrill",         twitter: "MikieSherrill",          confidence: "verified" },
  { state: "NM", name: "Michelle Lujan Grisham", twitter: "GovMLG",                 confidence: "verified" },
  { state: "NV", name: "Joe Lombardo",           twitter: "GovLombardo",            confidence: "verified" },
  { state: "NY", name: "Kathy Hochul",           twitter: "GovKathyHochul",         confidence: "verified" },
  { state: "OH", name: "Mike DeWine",            twitter: "GovMikeDeWine",          confidence: "verified" },
  { state: "OK", name: "Kevin Stitt",            twitter: "GovKevinStitt",          confidence: "verified" },
  { state: "OR", name: "Tina Kotek",             twitter: "TinaKotek",              confidence: "verified" },
  { state: "PA", name: "Josh Shapiro",           twitter: "GovernorShapiro",        confidence: "verified" },
  { state: "RI", name: "Dan McKee",              twitter: "GovDanMcKee",            confidence: "inferred" },
  { state: "SC", name: "Henry McMaster",         twitter: "HenryMcMaster",          confidence: "verified" },
  { state: "SD", name: "Larry Rhoden",           twitter: "LarryRhoden",            confidence: "inferred" },
  { state: "SD", name: "Kristi Noem",            twitter: "KristiNoem",             confidence: "verified" },
  { state: "TN", name: "Bill Lee",               twitter: "BillLeeTN",              confidence: "verified" },
  { state: "TX", name: "Greg Abbott",            twitter: "GregAbbott_TX",          confidence: "verified" },
  { state: "UT", name: "Spencer Cox",            twitter: "SpencerJCox",            confidence: "verified" },
  { state: "VA", name: "Abigail Spanberger",     twitter: "AbigailSpanberger",      confidence: "verified" },
  { state: "VT", name: "Phil Scott",             twitter: "GovPhilScott",           confidence: "verified" },
  { state: "WA", name: "Bob Ferguson",           twitter: "GovFerguson",            confidence: "inferred" },
  { state: "WI", name: "Tony Evers",             twitter: "GovEvers",               confidence: "verified" },
  { state: "WV", name: "Patrick Morrisey",       twitter: "PatrickMorrisey",        confidence: "verified" },
  { state: "WY", name: "Mark Gordon",            twitter: "GovernorGordon",         confidence: "verified" },
];

async function main() {
  console.log("🏛️  Jack — Governor Handle Seeder");
  console.log("==================================");
  if (DRY_RUN) console.log("🔍 DRY RUN — no writes\n");

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const gov of GOVERNOR_HANDLES) {
    const { data: politicians } = await supabase
      .from("politicians")
      .select("id, full_name, social_handles")
      .eq("state", gov.state)
      .eq("office", "Governor")
      .ilike("full_name", `%${gov.name.split(" ")[1] ?? gov.name}%`)
      .eq("is_active", true);

    if (!politicians || politicians.length === 0) {
      console.log(`  ⚠️  Not found in DB: ${gov.name} (${gov.state})`);
      notFound++;
      continue;
    }

    for (const p of politicians) {
      const existing = (p.social_handles ?? {}) as Record<string, string>;
      if (existing.twitter) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [preview] ${p.full_name} (${gov.state}) → @${gov.twitter} (${gov.confidence})`);
      } else {
        await supabase
          .from("politicians")
          .update({
            social_handles: {
              ...existing,
              twitter: gov.twitter,
              twitter_confidence: gov.confidence,
            },
          })
          .eq("id", p.id);
        console.log(`  ✅ ${p.full_name} (${gov.state}) → @${gov.twitter} (${gov.confidence})`);
      }
      updated++;
    }
  }

  console.log(`\n📊 Coverage report...`);
  const { data } = await supabase
    .from("politicians")
    .select("social_handles")
    .eq("office", "Governor")
    .eq("is_active", true);

  const total = data?.length ?? 0;
  const withHandle = data?.filter((p) => {
    const h = (p.social_handles ?? {}) as Record<string, string>;
    return !!h.twitter;
  }).length ?? 0;

  console.log(`  Governor: ${withHandle}/${total} (${Math.round(withHandle / total * 100)}%)`);
  console.log(`\n✅ Done. Updated: ${updated} | Already had handle: ${skipped} | Not found: ${notFound}`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
