/**
 * Jack - List Agent
 *
 * Builds the public X List "Politicians on WhyTho" owned by @WhyTho_official and
 * adds every politician with a verified, unambiguous X handle as a member.
 *
 * X removed follow-by-API from all self-serve tiers on 16 April 2026, so a
 * public List is the follow step. Nothing here follows, posts, replies or DMs.
 *
 * Steps (all idempotent, safe to rerun):
 *   1. Resolve numeric X ids for handles that lack social_handles.twitter_id
 *      (GET /2/users/by, bearer token, 100 handles per call, $0.010 per user).
 *   2. Create the list once (POST /2/lists, OAuth 1.0a, $0.010). The id is kept
 *      in jack_config under key "x_politicians_list".
 *   3. Add members not yet in the snapshot (POST /2/lists/:id/members, $0.005
 *      each). The snapshot lives in jack_config under "x_politicians_list_members"
 *      and is saved after every add so a crash resumes cleanly.
 *   4. Write one x_credit_log row.
 *
 * Usage:
 *   npx tsx scripts/jack-list.ts --dry-run          # No X calls. Prints counts and estimated cost
 *   npx tsx scripts/jack-list.ts --limit=5           # Resolve + add at most 5 members
 *   npx tsx scripts/jack-list.ts                     # Full run
 *   npx tsx scripts/jack-list.ts --export-handles    # CSV of targets to stdout, no X calls
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { collectionTargets, handleOf, identityMemberIds, loadJackProfiles, type JackProfile } from "./jack-identity";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BEARER_TOKEN    = process.env.X_API_BEARER_TOKEN!;
const CONSUMER_KEY    = process.env.X_API_KEY!;
const CONSUMER_SECRET = process.env.X_API_SECRET!;
const ACCESS_TOKEN    = process.env.X_ACCESS_TOKEN!;
const ACCESS_SECRET   = process.env.X_ACCESS_TOKEN_SECRET!;

const args           = process.argv.slice(2);
const DRY_RUN        = args.includes("--dry-run");
const EXPORT_HANDLES = args.includes("--export-handles");
const LIMIT          = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "9999");

const LIST_NAME        = "Politicians on WhyTho";
const LIST_DESCRIPTION = "Every US official with a profile on whytho.us, where constituents ask and response rates are public.";
const CONFIG_LIST_KEY  = "x_politicians_list";
const CONFIG_MEMBERS_KEY = "x_politicians_list_members";

// Pay-per-use prices from docs.x.com/x-api/getting-started/pricing (Nov 2026)
const PRICE_USER_READ   = 0.010;
const PRICE_LIST_CREATE = 0.010;
const PRICE_LIST_MANAGE = 0.005;

const API = "https://api.twitter.com/2";

let creditsUsed = 0;

type Target = JackProfile & { verifiedHandle: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function metaOf(row: JackProfile): Record<string, Json | undefined> {
  const handles = row.social_handles;
  return handles && typeof handles === "object" && !Array.isArray(handles) ? { ...handles } : {};
}

function twitterIdOf(row: JackProfile): string | null {
  const id = metaOf(row).twitter_id;
  return typeof id === "string" && /^\d+$/.test(id) ? id : null;
}

/** Numeric id already stored on any member row of this identity. */
function identityTwitterId(profiles: readonly JackProfile[], target: Target): string | null {
  const members = new Set(identityMemberIds(profiles, target.id));
  for (const row of profiles) {
    if (!members.has(row.id)) continue;
    if (handleOf(row)?.toLowerCase() !== target.verifiedHandle.toLowerCase()) continue;
    const id = twitterIdOf(row);
    if (id) return id;
  }
  return null;
}

async function waitForRateLimit(res: Response, label: string): Promise<void> {
  const resetAt = res.headers.get("x-rate-limit-reset");
  const waitMs  = resetAt ? Math.max(5000, parseInt(resetAt) * 1000 - Date.now() + 2000) : 60000;
  console.log(`  ⏳ ${label}: rate limited, waiting ${Math.round(waitMs / 1000)}s`);
  await sleep(waitMs);
}

function explainHttp(status: number, raw: string): string {
  let detail = "";
  try {
    const err = JSON.parse(raw) as { detail?: string; title?: string; errors?: Array<{ message?: string }> };
    detail = err.detail ?? err.title ?? err.errors?.[0]?.message ?? "";
  } catch { /* raw was not JSON */ }
  if (status === 402) return `HTTP 402: X credit balance is empty. Top up in the developer console. ${detail}`;
  if (status === 403) return `HTTP 403: app lacks permission (needs list.write user context). ${detail}`;
  return `HTTP ${status}: ${detail || raw.slice(0, 200)}`;
}

// ── OAuth 1.0a (user context, same signer as jack-herald) ─────────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21").replace(/'/g, "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function buildOAuthHeader(method: string, url: string, extraParams: Record<string, string> = {}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     CONSUMER_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            ACCESS_TOKEN,
    oauth_version:          "1.0",
  };
  const allParams   = { ...oauthParams, ...extraParams };
  const paramString = Object.keys(allParams).sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k] ?? "")}`).join("&");
  const baseString  = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey  = `${percentEncode(CONSUMER_SECRET)}&${percentEncode(ACCESS_SECRET)}`;
  oauthParams.oauth_signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
  return "OAuth " + Object.keys(oauthParams).sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k] ?? "")}"`).join(", ");
}

async function postUserContext(url: string, body: Record<string, unknown>, label: string): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null; raw: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method:  "POST",
      headers: { Authorization: buildOAuthHeader("POST", url), "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    if (res.status === 429 && attempt === 0) { await waitForRateLimit(res, label); continue; }
    const raw = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(raw) as Record<string, unknown>; } catch { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, json, raw };
  }
  throw new Error(`${label}: still rate limited after retry`);
}

// ── Step 1: resolve numeric ids ───────────────────────────────────────────────

interface LookupResult {
  found:  Map<string, { id: string; username: string }>;
  errors: Array<{ value: string; title: string; detail: string }>;
}

async function lookupUsers(handles: string[]): Promise<LookupResult> {
  const result: LookupResult = { found: new Map(), errors: [] };
  for (let i = 0; i < handles.length; i += 100) {
    const chunk = handles.slice(i, i + 100);
    const url   = `${API}/users/by?usernames=${encodeURIComponent(chunk.join(","))}&user.fields=id,username`;
    let res = await fetch(url, { headers: { Authorization: `Bearer ${BEARER_TOKEN}` } });
    if (res.status === 429) {
      await waitForRateLimit(res, "users/by");
      res = await fetch(url, { headers: { Authorization: `Bearer ${BEARER_TOKEN}` } });
    }
    const raw = await res.text();
    if (!res.ok) throw new Error(`users/by failed: ${explainHttp(res.status, raw)}`);
    const json = JSON.parse(raw) as {
      data?: Array<{ id: string; username: string }>;
      errors?: Array<{ value?: string; title?: string; detail?: string }>;
    };
    for (const user of json.data ?? []) result.found.set(user.username.toLowerCase(), user);
    for (const err of json.errors ?? []) {
      result.errors.push({ value: err.value ?? "", title: err.title ?? "Error", detail: err.detail ?? "" });
    }
    creditsUsed += (json.data?.length ?? 0) * PRICE_USER_READ;
    console.log(`  🔎 users/by chunk ${Math.floor(i / 100) + 1}: ${json.data?.length ?? 0} found, ${json.errors?.length ?? 0} missing`);
    await sleep(300);
  }
  return result;
}

async function resolveIds(profiles: JackProfile[], targets: Target[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>(); // target.id -> twitter_id
  const unresolved: Target[] = [];
  for (const target of targets) {
    const existing = identityTwitterId(profiles, target);
    if (existing) ids.set(target.id, existing); else unresolved.push(target);
  }
  console.log(`→ ${ids.size} already have a numeric id, ${unresolved.length} need lookup`);
  if (unresolved.length === 0) return ids;

  const calls = Math.ceil(unresolved.length / 100);
  console.log(`  Estimated lookup cost: ${calls} call${calls === 1 ? "" : "s"}, up to $${(unresolved.length * PRICE_USER_READ).toFixed(2)}`);
  if (DRY_RUN) { console.log("  [dry run - skipping lookup]"); return ids; }

  const lookup = await lookupUsers(unresolved.map((t) => t.verifiedHandle));
  const now    = new Date().toISOString();
  const missed: string[] = [];

  for (const target of unresolved) {
    const user    = lookup.found.get(target.verifiedHandle.toLowerCase());
    const members = new Set(identityMemberIds(profiles, target.id));
    const rows    = profiles.filter((row) => members.has(row.id) && handleOf(row)?.toLowerCase() === target.verifiedHandle.toLowerCase());
    for (const row of rows) {
      const meta = metaOf(row);
      const next: Record<string, Json | undefined> = user
        ? { ...meta, twitter_id: user.id, twitter_id_resolved_at: now, twitter_lookup_error: undefined }
        : { ...meta, twitter_lookup_error: lookup.errors.find((e) => e.value.toLowerCase() === target.verifiedHandle.toLowerCase())?.title ?? "not_found", twitter_lookup_checked_at: now };
      const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as Json;
      const { error } = await supabase.from("politicians").update({ social_handles: clean }).eq("id", row.id);
      if (error) throw new Error(`politicians update failed for ${row.slug}: ${error.message}`);
      row.social_handles = clean;
    }
    if (user) ids.set(target.id, user.id); else missed.push(`@${target.verifiedHandle} (${target.full_name})`);
  }

  if (missed.length) {
    console.log(`\n  ⚠️  ${missed.length} handle${missed.length === 1 ? "" : "s"} not found on X (renamed or suspended), left as-is for review:`);
    for (const m of missed) console.log(`     ${m}`);
  }
  return ids;
}

// ── Step 2: list config ───────────────────────────────────────────────────────

async function readConfig<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from("jack_config").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`jack_config read failed: ${error.message}`);
  return (data?.value as T | undefined) ?? null;
}

async function writeConfig(key: string, value: Json): Promise<void> {
  const { error } = await supabase.from("jack_config").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`jack_config write failed: ${error.message}`);
}

async function ensureList(): Promise<string | null> {
  const existing = await readConfig<{ list_id?: string }>(CONFIG_LIST_KEY);
  if (existing?.list_id) { console.log(`→ List exists: ${existing.list_id}`); return existing.list_id; }
  console.log(`→ No list yet. Would create public list "${LIST_NAME}" ($${PRICE_LIST_CREATE.toFixed(3)})`);
  if (DRY_RUN) return null;

  const { ok, status, json, raw } = await postUserContext(`${API}/lists`, { name: LIST_NAME, description: LIST_DESCRIPTION, private: false }, "lists");
  if (!ok) throw new Error(`List create failed: ${explainHttp(status, raw)}`);
  creditsUsed += PRICE_LIST_CREATE;
  const data = json?.data as { id?: string; name?: string } | undefined;
  if (!data?.id) throw new Error(`List create returned no id: ${raw.slice(0, 200)}`);
  await writeConfig(CONFIG_LIST_KEY, { list_id: data.id, name: data.name ?? LIST_NAME, created_at: new Date().toISOString() });
  console.log(`  ✅ Created list ${data.id}: https://x.com/i/lists/${data.id}`);
  return data.id;
}

// ── Step 3: members ───────────────────────────────────────────────────────────

async function addMembers(listId: string | null, targets: Target[], ids: Map<string, string>): Promise<{ added: number; skipped: number; failed: number }> {
  const snapshot = (await readConfig<{ ids?: string[] }>(CONFIG_MEMBERS_KEY))?.ids ?? [];
  const members  = new Set(snapshot);
  const todo     = targets.filter((t) => ids.has(t.id) && !members.has(ids.get(t.id)!));
  const noId     = targets.filter((t) => !ids.has(t.id)).length;

  const plannedAdds = DRY_RUN ? targets.length - members.size : todo.length;
  console.log(`→ ${members.size} already on the list, ${todo.length} to add, ${noId} without a numeric id${DRY_RUN ? " (ids resolve on the live run)" : ""}`);
  console.log(`  Estimated add cost: $${(Math.max(0, plannedAdds) * PRICE_LIST_MANAGE).toFixed(2)} (300 adds per 15 min, so a pause is normal)`);
  if (DRY_RUN || !listId) { if (DRY_RUN) console.log("  [dry run - no adds]"); return { added: 0, skipped: members.size, failed: 0 }; }

  let added = 0, failed = 0, consecutiveFailures = 0;
  for (const target of todo) {
    const userId = ids.get(target.id)!;
    const { ok, status, json, raw } = await postUserContext(`${API}/lists/${listId}/members`, { user_id: userId }, `add @${target.verifiedHandle}`);
    const isMember = (json?.data as { is_member?: boolean } | undefined)?.is_member === true;
    if (ok && isMember) {
      members.add(userId);
      await writeConfig(CONFIG_MEMBERS_KEY, { ids: [...members] });
      creditsUsed += PRICE_LIST_MANAGE;
      added++; consecutiveFailures = 0;
      console.log(`  ✅ @${target.verifiedHandle} (${target.full_name})`);
    } else {
      failed++; consecutiveFailures++;
      console.log(`  ❌ @${target.verifiedHandle}: ${explainHttp(status, raw)}`);
      if (status === 402 || status === 403 || consecutiveFailures >= 5) {
        console.log("  Stopping: repeated failures. Fix the cause and rerun; progress is saved.");
        break;
      }
    }
    await sleep(250);
  }
  return { added, skipped: members.size - added, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📋 Jack - List Agent");
  console.log("====================");
  if (DRY_RUN) console.log("🔍 DRY RUN - no X calls, no writes\n");

  const profiles = await loadJackProfiles(supabase);
  const targets  = collectionTargets(profiles).slice(0, LIMIT);

  if (EXPORT_HANDLES) {
    console.log("handle,name,office,state,slug,twitter_id");
    for (const t of targets) {
      const id = identityTwitterId(profiles, t) ?? "";
      console.log([t.verifiedHandle, t.full_name, t.office ?? "", t.state ?? "", t.slug, id].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    }
    return;
  }

  console.log(`→ ${targets.length} politicians with verified, unambiguous X handles${LIMIT < 9999 ? ` (limit ${LIMIT})` : ""}\n`);

  if (!DRY_RUN && (!BEARER_TOKEN || !CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET)) {
    throw new Error("Missing X credentials. Check X_API_BEARER_TOKEN, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
  }

  const ids    = await resolveIds(profiles, targets);
  const listId = await ensureList();
  const result = await addMembers(listId, targets, ids);

  if (!DRY_RUN) {
    const { error } = await supabase.from("x_credit_log").insert({
      agent:               "list",
      credits_used:        Number(creditsUsed.toFixed(4)),
      politicians_covered: targets.length,
      notes:               `list ${listId ?? "none"}: ${result.added} added, ${result.skipped} already members, ${result.failed} failed`,
    });
    if (error) console.log(`  ⚠️  x_credit_log insert failed: ${error.message}`);
  }

  console.log("\n====================");
  console.log("✅ List agent complete");
  console.log(`   Added:           ${result.added}`);
  console.log(`   Already members: ${result.skipped}`);
  if (result.failed) console.log(`   Failed:          ${result.failed}`);
  console.log(`   Credits used:    $${creditsUsed.toFixed(2)}${DRY_RUN ? " (dry run)" : ""}`);
  if (listId) console.log(`   List:            https://x.com/i/lists/${listId}`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
