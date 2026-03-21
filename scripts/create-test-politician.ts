#!/usr/bin/env npx tsx
/**
 * Create a test politician + seed questions for testing the full politician experience.
 *
 * Usage:
 *   npx tsx scripts/create-test-politician.ts
 *   npx tsx scripts/create-test-politician.ts --reset   (delete existing test politicians first)
 *
 * What it creates:
 *   - 1 fictional politician (Alex Rivera, WY-01, Independent) with is_test=true
 *   - 15 questions across vote ranges: 5 qualifying (≥10 votes), 5 borderline, 5 low
 *   - Mix of seeded and user-submitted questions
 *
 * After running:
 *   1. Go to /admin/test-accounts?secret=<ADMIN_SECRET>
 *   2. Click "Start Claim Flow →" to claim as yourself
 *   3. After claiming, click "Bypass → Tier 2" to skip real verification
 *   4. Visit /dashboard to test the full politician experience
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RESET = process.argv.includes("--reset");

// ── Week number helper ──────────────────────────────────────────────────────

function currentWeekNumber(): number {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return now.getFullYear() * 100 + weekNum;
}

// ── Test politician data ────────────────────────────────────────────────────

const TEST_POLITICIAN = {
  slug: "alex-rivera-wy01-test",
  full_name: "Alex Rivera",
  office: "U.S. Representative",
  state: "WY",
  district: "WY-01",
  party: "Independent",
  bio: "Alex Rivera is a fictional politician created for WhyTho platform testing. Not a real person.",
  website_url: null,
  photo_url: null,
  is_active: true,
  is_test: true,
  verification_tier: "0",
  politician_type: "elected",
  aliases: ["Representative Rivera", "Rep. Rivera"],
  social_handles: {},
};

// ── Questions to seed ──────────────────────────────────────────────────────

function buildQuestions(politicianId: string, weekNumber: number) {
  return [
    // Qualifying questions (net_upvotes >= 10) — these affect participation rate
    {
      politician_id: politicianId,
      body: "What is your position on expanding Medicare to cover dental and vision care for all constituents?",
      net_upvotes: 47,
      is_seeded: true,
      source: "seeded",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "How do you plan to address the rising cost of housing in Wyoming?",
      net_upvotes: 31,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "Will you commit to holding a public town hall in every county of WY-01 this year?",
      net_upvotes: 24,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "What specific legislation have you introduced or co-sponsored to reduce prescription drug costs?",
      net_upvotes: 19,
      is_seeded: true,
      source: "seeded",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "Do you support raising the federal minimum wage, and if so, to what amount?",
      net_upvotes: 15,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    // Borderline questions (5-9 votes)
    {
      politician_id: politicianId,
      body: "What is your stance on federal funding for rural broadband expansion?",
      net_upvotes: 9,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "Have you read the full text of every bill you voted yes on in the last session?",
      net_upvotes: 7,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "What is your plan to support Wyoming's coal and energy workers during the energy transition?",
      net_upvotes: 6,
      is_seeded: true,
      source: "seeded",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "Do you support term limits for members of Congress?",
      net_upvotes: 5,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "What lobbyists or industry groups have you met with in the past 90 days?",
      net_upvotes: 5,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    // Low-vote questions (1-4 votes)
    {
      politician_id: politicianId,
      body: "Why did you miss 3 consecutive votes on the infrastructure bill last month?",
      net_upvotes: 4,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "What is your position on federal land management policy in Wyoming?",
      net_upvotes: 3,
      is_seeded: true,
      source: "seeded",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "Will you publicly disclose all your stock trades within 48 hours as required by the STOCK Act?",
      net_upvotes: 2,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "Do you support campaign finance reform, including limits on PAC donations?",
      net_upvotes: 1,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
    {
      politician_id: politicianId,
      body: "What concrete steps have you taken to reduce your office's carbon footprint?",
      net_upvotes: 1,
      is_seeded: false,
      source: "web",
      status: "active",
      week_number: weekNumber,
    },
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("WhyTho — Test Politician Setup");
  console.log("==============================\n");

  // Reset existing test politicians if --reset flag
  if (RESET) {
    console.log("Resetting existing test politicians...");
    const { data: existing } = await supabase
      .from("politicians")
      .select("id")
      .eq("is_test", true);

    if (existing && existing.length > 0) {
      const ids = existing.map((p) => p.id);
      await supabase.from("politician_verifications").delete().in("politician_id", ids);
      await supabase.from("politician_team").delete().in("politician_id", ids);
      await supabase.from("questions").delete().in("politician_id", ids);
      await supabase.from("politicians").delete().in("id", ids);
      console.log(`Deleted ${ids.length} existing test politician(s)\n`);
    }
  }

  // Check if test politician already exists
  const { data: existing } = await supabase
    .from("politicians")
    .select("id, full_name, verification_tier")
    .eq("slug", TEST_POLITICIAN.slug)
    .single();

  let politicianId: string;

  if (existing) {
    politicianId = existing.id;
    console.log(`Test politician already exists: ${existing.full_name} (${politicianId})`);
    console.log(`Current tier: ${existing.verification_tier}`);
    console.log("Run with --reset to delete and recreate.\n");
  } else {
    // Insert test politician
    const { data: created, error } = await supabase
      .from("politicians")
      .insert(TEST_POLITICIAN)
      .select("id")
      .single();

    if (error || !created) {
      console.error("Failed to create test politician:", error?.message);
      process.exit(1);
    }

    politicianId = created.id;
    console.log(`Created test politician: ${TEST_POLITICIAN.full_name}`);
    console.log(`  ID:   ${politicianId}`);
    console.log(`  Slug: ${TEST_POLITICIAN.slug}`);
    console.log(`  URL:  https://whytho.us/${TEST_POLITICIAN.slug}\n`);
  }

  // Seed questions
  const weekNumber = currentWeekNumber();
  const questions = buildQuestions(politicianId, weekNumber);

  const { data: existingQs } = await supabase
    .from("questions")
    .select("id")
    .eq("politician_id", politicianId)
    .eq("week_number", weekNumber);

  if (existingQs && existingQs.length > 0) {
    console.log(`Questions already seeded for week ${weekNumber} (${existingQs.length} found). Skipping.`);
  } else {
    const { error: qErr } = await supabase.from("questions").insert(questions);
    if (qErr) {
      console.error("Failed to seed questions:", qErr.message);
      process.exit(1);
    }
    console.log(`Seeded ${questions.length} questions for week ${weekNumber}`);
    console.log(`  5 qualifying (≥10 votes), 5 borderline (5-9), 5 low (1-4)\n`);
  }

  // Done
  const adminSecret = process.env.ADMIN_SECRET ?? "<your-admin-secret>";
  const siteUrl = "https://whytho.us";

  console.log("==============================");
  console.log("Next steps:");
  console.log(`  1. Go to ${siteUrl}/admin/test-accounts?secret=${adminSecret}`);
  console.log(`  2. Click "Start Claim Flow →"`);
  console.log(`  3. After claiming, click "Bypass → Tier 2"`);
  console.log(`  4. Visit ${siteUrl}/dashboard to test the politician experience`);
  console.log(`  5. View profile at ${siteUrl}/${TEST_POLITICIAN.slug}`);
  console.log("==============================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
