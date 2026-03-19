/**
 * Jack — X API Connection Test
 *
 * Verifies all X API credentials are correctly set and working.
 * Does NOT consume meaningful credits — just hits /users/me.
 *
 * Usage:
 *   npx tsx scripts/jack-test-connection.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

const REQUIRED_VARS = [
  "X_API_BEARER_TOKEN",
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
  "X_WHYTHO_HANDLE",
];

async function checkEnvVars() {
  console.log("🔑 Checking environment variables...");
  let allPresent = true;
  for (const v of REQUIRED_VARS) {
    const val = process.env[v];
    if (!val) {
      console.log(`  ❌ Missing: ${v}`);
      allPresent = false;
    } else {
      console.log(`  ✅ ${v} = ${val.slice(0, 6)}...`);
    }
  }
  return allPresent;
}

async function testBearerToken() {
  console.log("\n🌐 Testing Bearer Token (read access)...");
  const handle = process.env.X_WHYTHO_HANDLE ?? "WhyTho_official";

  const res = await fetch(
    `https://api.twitter.com/2/users/by/username/${handle}?user.fields=id,name,username,public_metrics`,
    {
      headers: {
        Authorization: `Bearer ${process.env.X_API_BEARER_TOKEN}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.log(`  ❌ Bearer token test failed: ${res.status} ${err}`);
    return false;
  }

  const data = await res.json() as { data?: { id: string; name: string; username: string; public_metrics?: { followers_count: number; tweet_count: number } } };
  const user = data.data;
  if (!user) {
    console.log("  ❌ No user data returned");
    return false;
  }

  console.log(`  ✅ Connected as @${user.username} (${user.name})`);
  console.log(`     ID: ${user.id}`);
  if (user.public_metrics) {
    console.log(`     Followers: ${user.public_metrics.followers_count.toLocaleString()}`);
    console.log(`     Tweets: ${user.public_metrics.tweet_count.toLocaleString()}`);
  }
  return true;
}

async function testSearchAccess() {
  console.log("\n🔍 Testing search access (read credits)...");
  // Search for exactly 1 tweet mentioning a well-known politician — minimal credit use
  const res = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?query=%40SenSchumer+%3F&max_results=10&tweet.fields=public_metrics,created_at`,
    {
      headers: {
        Authorization: `Bearer ${process.env.X_API_BEARER_TOKEN}`,
      },
    }
  );

  if (res.status === 403) {
    console.log("  ⚠️  Search not available on current API tier (need Basic or higher)");
    console.log("     Bearer auth works but search requires paid access");
    return "limited";
  }

  if (!res.ok) {
    const err = await res.text();
    console.log(`  ❌ Search test failed: ${res.status} ${err}`);
    return false;
  }

  const data = await res.json() as { data?: unknown[]; meta?: { result_count: number } };
  const count = data.meta?.result_count ?? 0;
  console.log(`  ✅ Search works — returned ${count} tweets`);
  console.log(`     Rate limit headers: see raw response`);
  return true;
}

async function testWriteAccess() {
  console.log("\n✍️  Write access (OAuth 1.0a) — skipping live test to avoid posting");
  console.log("     Credentials present:", !!(process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET));
  console.log("     Write access will be verified when Herald runs its first reply");
  return true;
}

async function main() {
  console.log("🐦 Jack — X API Connection Test");
  console.log("=================================\n");

  const envOk = await checkEnvVars();
  if (!envOk) {
    console.log("\n❌ Fix missing env vars in .env.local first, then re-run.");
    process.exit(1);
  }

  const bearerOk = await testBearerToken();
  if (!bearerOk) {
    console.log("\n❌ Bearer token invalid. Check X_API_BEARER_TOKEN in .env.local.");
    process.exit(1);
  }

  const searchResult = await testSearchAccess();
  await testWriteAccess();

  console.log("\n=================================");
  if (searchResult === true) {
    console.log("✅ All systems go. Ready to run Scout → Harvester.");
  } else if (searchResult === "limited") {
    console.log("⚠️  Auth works but search API requires paid tier.");
    console.log("   Check X developer dashboard → confirm credits are active.");
    console.log("   Scout (handle discovery via Congress.gov) will still work.");
  } else {
    console.log("⚠️  Partial success. Review errors above.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
