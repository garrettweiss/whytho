import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const IDENTITY_CARD_FIELDS = "id,slug,full_name,office,state,district,party,photo_url,politician_type,is_candidate,candidate_status,candidate_election_year,candidate_office,incumbent_challenge,is_active,is_test,verification_tier,race_id,canonical_politician_id";

/** Resolve in bounded batches while retaining the original ID as the lookup key. */
export async function loadCanonicalPeople(client: SupabaseClient<Database>, sourceIds: readonly string[], signal: AbortSignal) {
  const ids = [...new Set(sourceIds)];
  const links = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await client.from("politicians").select("id,canonical_politician_id")
      .in("id", ids.slice(offset, offset + 200)).abortSignal(signal);
    if (error || !data) throw new Error("Politician identity links unavailable");
    for (const row of data) links.set(row.id, row.canonical_politician_id ?? row.id);
  }
  const roots = [...new Set(links.values())];
  const people = [];
  for (let offset = 0; offset < roots.length; offset += 200) {
    const { data, error } = await client.from("politicians").select(IDENTITY_CARD_FIELDS)
      .in("id", roots.slice(offset, offset + 200)).abortSignal(signal);
    if (error || !data) throw new Error("Canonical politician profiles unavailable");
    people.push(...data);
  }
  const byRoot = new Map(people.map(person => [person.id, person]));
  return new Map(ids.flatMap(id => {
    const person = byRoot.get(links.get(id) ?? "");
    if (!person || person.canonical_politician_id) throw new Error("Incomplete politician identity mapping");
    return [[id, person] as const];
  }));
}

/** Every original parent is retained, so count its children exactly once. */
export async function loadIdentityMembers(client: SupabaseClient<Database>, canonicalIds: readonly string[], signal: AbortSignal) {
  const ids = [...new Set(canonicalIds)];
  const members = new Map(ids.map(id => [id, [id]]));
  for (let chunk = 0; chunk < ids.length; chunk += 200) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("politicians").select("id,canonical_politician_id")
        .in("canonical_politician_id", ids.slice(chunk, chunk + 200))
        .eq("is_test", false).order("id").range(offset, offset + 499).abortSignal(signal);
      if (error || !data) throw new Error("Politician identity members unavailable");
      for (const row of data) {
        const group = members.get(row.canonical_politician_id!);
        if (!group || group.includes(row.id) || group.length >= 200) throw new Error("Invalid politician identity group");
        group.push(row.id);
      }
      if (data.length < 500) break;
    }
  }
  return members;
}
