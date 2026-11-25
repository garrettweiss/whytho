import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database";
import { STATES } from "../lib/search/states";

export interface JackProfile {
  id: string;
  canonical_politician_id: string | null;
  slug: string;
  full_name: string;
  office: string | null;
  state: string | null;
  bioguide_id: string | null;
  social_handles: Json;
  verification_tier: string;
  is_active: boolean;
  is_test: boolean;
}

const PROFILE_FIELDS = "id,canonical_politician_id,slug,full_name,office,state,bioguide_id,social_handles,verification_tier,is_active,is_test";
const PAGE_SIZE = 500;
export function idChunks(ids: readonly string[]): string[][] {
  const unique = [...new Set(ids)];
  return Array.from({ length: Math.ceil(unique.length / 200) }, (_, i) => unique.slice(i * 200, (i + 1) * 200));
}

/** One bounded roster load per script, with no per-person network fanout. */
export async function loadJackProfiles(client: SupabaseClient<Database>, offices?: readonly string[]): Promise<JackProfile[]> {
  const roots: JackProfile[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client.from("politicians").select(PROFILE_FIELDS)
      .is("canonical_politician_id", null).eq("is_active", true).eq("is_test", false)
      .order("id").range(offset, offset + PAGE_SIZE - 1);
    if (offices) query = query.in("office", [...offices]);
    const { data, error } = await query;
    if (error) throw error;
    roots.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  const aliases: JackProfile[] = [];
  for (const ids of idChunks(roots.map(row => row.id))) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client.from("politicians").select(PROFILE_FIELDS)
        .in("canonical_politician_id", ids).eq("is_test", false)
        .order("id").range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      aliases.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
  }
  return [...roots, ...aliases];
}

export function canonicalProfile(rows: readonly JackProfile[], sourceId: string): JackProfile | undefined {
  const source = rows.find(row => row.id === sourceId);
  if (!source || source.is_test) return undefined;
  const root = source.canonical_politician_id ? rows.find(row => row.id === source.canonical_politician_id) : source;
  return root && !root.canonical_politician_id && root.is_active && !root.is_test ? root : undefined;
}

export function identityMemberIds(rows: readonly JackProfile[], canonicalId: string): string[] {
  return rows.filter(row => !row.is_test && (row.id === canonicalId || row.canonical_politician_id === canonicalId)).map(row => row.id);
}

export function handleOf(row: JackProfile): string | null {
  const handles = row.social_handles;
  if (!handles || typeof handles !== "object" || Array.isArray(handles) || typeof handles.twitter !== "string") return null;
  const handle = handles.twitter.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

/** Any conflicting handle holds the identity for review, including inferred handles. */
export function verifiedIdentityHandle(rows: readonly JackProfile[], canonicalId: string): string | null {
  const members = new Set(identityMemberIds(rows, canonicalId));
  const handles = new Map<string, { handle: string; verified: boolean }>();
  for (const row of rows.filter(row => members.has(row.id))) {
    const handle = handleOf(row);
    if (!handle) continue;
    const metadata = row.social_handles as { twitter_confidence?: Json };
    const prior = handles.get(handle.toLowerCase());
    handles.set(handle.toLowerCase(), { handle, verified: prior?.verified === true || metadata.twitter_confidence === "verified" });
  }
  if (handles.size !== 1) return null;
  const entry = [...handles.values()][0]!;
  return entry.verified ? entry.handle : null;
}

export function collectionTargets(rows: readonly JackProfile[]): Array<JackProfile & { verifiedHandle: string }> {
  const candidates = rows.filter(row => !row.canonical_politician_id && row.is_active && !row.is_test)
    .map(row => ({ row, handle: verifiedIdentityHandle(rows, row.id) }));
  const owners = new Map<string, Set<string>>();
  // Even an inferred or internally conflicting second identity makes a handle ambiguous.
  for (const source of rows) {
    const handle = handleOf(source);
    const root = canonicalProfile(rows, source.id);
    if (!handle || !root) continue;
    const identities = owners.get(handle.toLowerCase()) ?? new Set<string>();
    identities.add(root.id);
    owners.set(handle.toLowerCase(), identities);
  }
  return candidates.flatMap(({ row, handle }) => handle && owners.get(handle.toLowerCase())?.size === 1 ? [{ ...row, verifiedHandle: handle }] : []);
}

export function normalizedJackName(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizedJackState(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const state = STATES.find(row => [row.code, row.name, row.slug].some(part => part.toLowerCase() === normalized));
  if (state) return state.code;
  const territories: Record<string, string> = { pr: "PR", "puerto rico": "PR", gu: "GU", guam: "GU", vi: "VI", "virgin islands": "VI", as: "AS", "american samoa": "AS", mp: "MP", "northern mariana islands": "MP", "district of columbia": "DC" };
  return territories[normalized] || null;
}

export function uniqueCanonicalMatch(rows: readonly JackProfile[], matches: readonly JackProfile[]): JackProfile | undefined {
  const roots = new Map<string, JackProfile>();
  for (const match of matches) {
    const root = canonicalProfile(rows, match.id);
    if (!root) return undefined;
    roots.set(root.id, root);
  }
  return roots.size === 1 ? [...roots.values()][0] : undefined;
}
