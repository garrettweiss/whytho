import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { ELECTION_OFFICES, ELECTION_PAGE_SIZE, exactElectionTotal, readCandidateCount } from "./helpers";
import type { ElectionDetail, ElectionDirectory, ElectionFilters, ElectionRace } from "./types";

const RACE_FIELDS = "id,slug,name,office,state,district,election_date,election_type,party,status,incumbent_id";
const PERSON_FIELDS = "id,slug,full_name,photo_url,office,state,party,candidate_status,is_active,race_id";
const CACHE_OPTIONS = { revalidate: 900, tags: ["races"] };

async function boundedRead<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try { return await read(controller.signal); } finally { clearTimeout(timer); }
}

export const loadElectionDirectory = unstable_cache(async (filters: ElectionFilters, today: string): Promise<ElectionDirectory> => boundedRead(async (signal) => {
  const office = ELECTION_OFFICES.find((item) => item.value === filters.office)?.stored;
  const offset = (filters.page - 1) * ELECTION_PAGE_SIZE;
  let query = createPublicClient().from("races")
    .select(`${RACE_FIELDS},candidates:politicians!politicians_race_id_fkey(count)`, { count: "exact" })
    .eq("candidates.is_test", false)
    .order("election_date", { ascending: filters.period === "upcoming" })
    .order("id", { ascending: true })
    .range(offset, offset + ELECTION_PAGE_SIZE - 1);
  if (office) query = query.eq("office", office);
  if (filters.state) query = query.eq("state", filters.state);
  if (filters.period === "upcoming") query = query.eq("status", "active").gte("election_date", today);
  if (filters.period === "past") query = query.or(`election_date.lt.${today},status.eq.completed`);
  const { data, error, count } = await query.abortSignal(signal);
  if (error?.code === "PGRST103" && filters.page > 1) {
    const firstPage = await query.range(0, 0).abortSignal(signal);
    if (firstPage.error) throw new Error("Election directory unavailable");
    return { races: [], total: exactElectionTotal(firstPage.count) };
  }
  if (error) throw new Error("Election directory unavailable");
  return {
    races: (data ?? []).map(({ candidates, ...race }) => ({ ...race, candidateCount: readCandidateCount(candidates) })),
    total: exactElectionTotal(count),
  };
}), ["public-election-directory-v2"], CACHE_OPTIONS);

export const loadElectionRace = unstable_cache(async (slug: string): Promise<ElectionRace | null> => {
  if (!slug || slug.length > 200 || /[\u0000-\u0020\u007f/\\?#]/.test(slug)) return null;
  return boundedRead(async (signal) => {
    const { data, error } = await createPublicClient().from("races").select(RACE_FIELDS).eq("slug", slug).abortSignal(signal).maybeSingle();
    if (error) throw new Error("Election record unavailable");
    return data;
  });
}, ["public-election-record-v2"], CACHE_OPTIONS);

export const loadElectionDetail = unstable_cache(async (slug: string, page: number): Promise<ElectionDetail | null> => {
  const race = await loadElectionRace(slug);
  if (!race) return null;
  return boundedRead(async (signal) => {
    const client = createPublicClient();
    const offset = (page - 1) * ELECTION_PAGE_SIZE;
    // Explicit race links preserve incumbents and former candidates whose type or
    // active flag changed after an election. Test profiles never enter the roster.
    const candidateQuery = client.from("politicians").select(PERSON_FIELDS, { count: "exact" })
      .eq("race_id", race.id).eq("is_test", false)
      .order("full_name", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + ELECTION_PAGE_SIZE - 1).abortSignal(signal);
    const officeholderQuery = race.incumbent_id
      ? client.from("politicians").select(PERSON_FIELDS).eq("id", race.incumbent_id).eq("is_test", false).abortSignal(signal).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [candidates, officeholder] = await Promise.all([candidateQuery, officeholderQuery]);
    if (candidates.error?.code === "PGRST103" && page > 1 && !officeholder.error) {
      const firstPage = await candidateQuery.range(0, 0).abortSignal(signal);
      if (firstPage.error) throw new Error("Election profiles unavailable");
      return { race, candidates: [], totalCandidates: exactElectionTotal(firstPage.count), recordedOfficeholder: officeholder.data };
    }
    if (candidates.error || officeholder.error) throw new Error("Election profiles unavailable");
    return { race, candidates: candidates.data ?? [], totalCandidates: exactElectionTotal(candidates.count), recordedOfficeholder: officeholder.data };
  });
}, ["public-election-detail-v2"], CACHE_OPTIONS);
