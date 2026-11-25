import "server-only";
import { loadCanonicalPeople } from "@/lib/identity/public";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { ELECTION_OFFICES, ELECTION_PAGE_SIZE, exactElectionTotal } from "./helpers";
import type { ElectionDetail, ElectionDirectory, ElectionFilters, ElectionRace, ElectionCandidate } from "./types";

const RACE_FIELDS = "id,slug,name,office,state,district,election_date,election_type,party,status,incumbent_id";
const CACHE_OPTIONS = { revalidate: 900, tags: ["races"] };

async function boundedRead<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try { return await read(controller.signal); } finally { clearTimeout(timer); }
}

/** Race membership belongs to its original dated record; public cards resolve to one person. */
async function loadRacePeople(raceIds: string[], signal: AbortSignal) {
  const client = createPublicClient();
  const memberships: { race_id: string; politician_id: string; candidate_status: string | null }[] = [];
  if (!raceIds.length) return new Map<string, ElectionCandidate[]>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("politicians").select("id,race_id,candidate_status")
      .in("race_id", raceIds).eq("is_test", false).order("id").range(offset, offset + 499).abortSignal(signal);
    if (error || !data) throw new Error("Election legacy membership unavailable");
    memberships.push(...data.map(row => ({ race_id: row.race_id!, politician_id: row.id, candidate_status: row.candidate_status })));
    if (data.length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("race_candidates").select("id,race_id,politician_id")
      .in("race_id", raceIds).order("id").range(offset, offset + 499).abortSignal(signal);
    if (error || !data) throw new Error("Election membership unavailable");
    memberships.push(...data.map(row => ({ ...row, candidate_status: null })));
    if (data.length < 500) break;
  }
  const people = await loadCanonicalPeople(client, memberships.map(row => row.politician_id), signal);
  const races = new Map(raceIds.map(id => [id, new Map<string, ElectionCandidate>()]));
  for (const member of memberships) {
    const person = people.get(member.politician_id)!;
    if (person.is_test) continue;
    const roster = races.get(member.race_id)!;
    if (!roster.has(person.id)) roster.set(person.id, { ...person, race_id: member.race_id, candidate_status: member.candidate_status });
  }
  return new Map([...races].map(([id, people]) => [id, [...people.values()].sort((a,b) => a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id))]));
}

export const loadElectionDirectory = unstable_cache(async (filters: ElectionFilters, today: string): Promise<ElectionDirectory> => boundedRead(async (signal) => {
  const office = ELECTION_OFFICES.find((item) => item.value === filters.office)?.stored;
  const offset = (filters.page - 1) * ELECTION_PAGE_SIZE;
  let query = createPublicClient().from("races")
    .select(RACE_FIELDS, { count: "exact" })
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
  const rosters = await loadRacePeople((data ?? []).map(row => row.id), signal);
  return {
    races: (data ?? []).map(race => ({ ...race, candidateCount: rosters.get(race.id)?.length ?? 0 })),
    total: exactElectionTotal(count),
  };
}), ["public-election-directory-identity-v3"], CACHE_OPTIONS);

export const loadElectionRace = unstable_cache(async (slug: string): Promise<ElectionRace | null> => {
  if (!slug || slug.length > 200 || /[\u0000-\u0020\u007f/\\?#]/.test(slug)) return null;
  return boundedRead(async (signal) => {
    const { data, error } = await createPublicClient().from("races").select(RACE_FIELDS).eq("slug", slug).abortSignal(signal).maybeSingle();
    if (error) throw new Error("Election record unavailable");
    return data;
  });
}, ["public-election-record-identity-v3"], CACHE_OPTIONS);

export const loadElectionDetail = unstable_cache(async (slug: string, page: number): Promise<ElectionDetail | null> => {
  const race = await loadElectionRace(slug);
  if (!race) return null;
  return boundedRead(async (signal) => {
    const client = createPublicClient();
    const offset = (page - 1) * ELECTION_PAGE_SIZE;
    const rosters = await loadRacePeople([race.id], signal);
    const candidates = rosters.get(race.id) ?? [];
    const officeholder = race.incumbent_id ? (await loadCanonicalPeople(client, [race.incumbent_id], signal)).get(race.incumbent_id) : null;
    return { race, candidates: candidates.slice(offset, offset + ELECTION_PAGE_SIZE), totalCandidates: candidates.length,
      recordedOfficeholder: officeholder && !officeholder.is_test ? officeholder : null };

  });
}, ["public-election-detail-identity-v3"], CACHE_OPTIONS);
