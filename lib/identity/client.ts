import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

export type PoliticianIdentity = { canonicalId: string; canonicalSlug: string; memberIds: string[] };
export type IdentityClient = SupabaseClient<Database>;
export const MAX_IDENTITY_MEMBERS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readPoliticianIdentity(value: unknown): PoliticianIdentity | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid politician identity");
  const row = value as Record<string, unknown>;
  const ids = row.member_ids;
  if (typeof row.canonical_id !== "string" || !UUID.test(row.canonical_id) ||
      typeof row.canonical_slug !== "string" || !row.canonical_slug || row.canonical_slug.length > 200 ||
      /[\u0000-\u0020\u007f/\\?#]/.test(row.canonical_slug) ||
      !Array.isArray(ids) || ids.length < 1 || ids.length > MAX_IDENTITY_MEMBERS ||
      !ids.every(id => typeof id === "string" && UUID.test(id)) ||
      new Set(ids).size !== ids.length || !ids.includes(row.canonical_id)) {
    throw new Error("Invalid politician identity");
  }
  return { canonicalId: row.canonical_id, canonicalSlug: row.canonical_slug, memberIds: ids as string[] };
}

/** CLI-safe public lookup. An unavailable migration is an error, never a self-match. */
export async function resolvePoliticianIdentity(id: string, client: IdentityClient): Promise<PoliticianIdentity | null> {
  if (!UUID.test(id)) throw new Error("Invalid politician ID");
  const { data, error } = await client.rpc("resolve_politician_identity", { p_id: id })
    .abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error("Politician identity lookup unavailable", { cause: error });
  return readPoliticianIdentity(data);
}

