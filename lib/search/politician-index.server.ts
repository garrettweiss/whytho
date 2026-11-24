import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";

type IndexedPolitician = [id: string, name: string, slug: string, state: string | null, office: string | null, party: string | null];
const PAGE_SIZE = 500;
export const POLITICIAN_INDEX_TIMEOUT_MS = 20_000;

export const loadPoliticianIndex = unstable_cache(async (): Promise<IndexedPolitician[]> => {
  const client = createPublicClient();
  const index: IndexedPolitician[] = [];
  const signal = AbortSignal.timeout(POLITICIAN_INDEX_TIMEOUT_MS);
  let after: string | undefined;
  for (;;) {
    let query = client.from("politicians").select("id,full_name,slug,state,office,party")
      .eq("is_active", true).eq("is_test", false).is("canonical_politician_id", null)
      .order("id").limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    const { data, error } = await query.abortSignal(signal);
    if (error || !data) throw new Error("Search index unavailable");
    index.push(...data.map(({ id, full_name, slug, state, office, party }): IndexedPolitician =>
      [id, full_name, slug, state, office, party]));
    if (data.length < PAGE_SIZE) return index;
    const next = data.at(-1)!.id;
    if (after && next <= after) throw new Error("Search index did not advance");
    after = next;
  }
}, ["canonical-politician-index-v1"], { revalidate: 300, tags: ["politician-directory"] });
