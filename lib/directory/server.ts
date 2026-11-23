import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient, createPublicClient } from "@/lib/supabase/server";
import { decodeDirectoryCursor, DIRECTORY_SNAPSHOT_MAX_AGE_MS, DIRECTORY_SNAPSHOT_MS, encodeDirectoryCursor, type DirectoryCursor } from "./cursor";
import { EXECUTIVE_OFFICES, NATIONAL_OFFICES, STATE_OFFICES } from "./scope";
import { arrangeDirectoryPeople } from "./presentation";
import { escapeLike, normalizeDirectoryFilters, OFFICES, quoteFilterValue, stateRecordValues } from "./search";
import { DIRECTORY_PAGE_SIZE, DirectoryInputError, type DirectoryFilters, type DirectoryPage, type DirectoryPerson } from "./types";
import type { Database } from "@/types/database";

const TIMEOUT_MS = 8_000;
const PUBLIC_FIELDS = "id,slug,full_name,politician_type,is_candidate,incumbent_challenge,office,district,state,party,photo_url,mayor_city_population";
type RankedProfile = [id: string, name: string, state: string | null, office: string | null];
type DirectoryRow = Pick<Database["public"]["Tables"]["politicians"]["Row"],
  "id" | "slug" | "full_name" | "politician_type" | "is_candidate" | "incumbent_challenge" | "office" | "district" | "state" | "party" | "photo_url" | "mayor_city_population">;

async function boundedRead<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await read(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

const getWeekNumber = unstable_cache(async (): Promise<number> => boundedRead(async (signal) => {
  const { data, error } = await createPublicClient().rpc("current_week_number").abortSignal(signal);
  if (error || typeof data !== "number" || !Number.isInteger(data) || data < 200001 || data % 100 < 1 || data % 100 > 53) {
    throw new Error("Directory reporting period unavailable");
  }
  return data;
}), ["directory-current-week-v1"], { revalidate: 300 });

function safePhotoUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// Cache the shared order separately so filters and continuation requests use the same snapshot.
const getHomepageRanking = unstable_cache(async (snapshot: number): Promise<RankedProfile[]> => boundedRead(async (signal) => {
  const { data, error } = await createAdminClient().rpc("homepage_directory_ranking", {
    p_as_of: new Date(snapshot).toISOString(),
  }).abortSignal(signal);
  if (error || !Array.isArray(data)) throw new Error("Homepage ranking unavailable");
  return data.map((profile) => {
    if (!Array.isArray(profile) || profile.length !== 4 || typeof profile[0] !== "string" ||
      typeof profile[1] !== "string" || (profile[2] !== null && typeof profile[2] !== "string") ||
      (profile[3] !== null && typeof profile[3] !== "string")) throw new Error("Invalid homepage ranking");
    return [profile[0], profile[1], profile[2], profile[3]];
  });
}), ["homepage-directory-ranking-v1"], { revalidate: DIRECTORY_SNAPSHOT_MAX_AGE_MS / 1000, tags: ["politician-directory"] });

const loadDirectoryPage = unstable_cache(async (
  filters: DirectoryFilters,
  cursorValue: string,
  weekNumber: number,
  snapshot?: number,
): Promise<DirectoryPage> => boundedRead(async (signal) => {
  const supabase = createPublicClient();
  const cursor = decodeDirectoryCursor(cursorValue, filters);
  let aliasIds: string[] = [];

  if (filters.q) {
    // Exact aliases are bounded and still pass through the public profile filters.
    // The existing fuzzy RPC does not expose is_test, so it cannot enforce this contract.
    const { data: aliases, error } = await supabase.from("politician_aliases")
      .select("politician_id")
      .ilike("alias", escapeLike(filters.q))
      .order("politician_id")
      .limit(101)
      .abortSignal(signal);
    if (error) throw new Error("Directory alias lookup failed");
    if (!aliases || aliases.length > 100) throw new DirectoryInputError("Use a more specific politician name.");
    aliasIds = [...new Set(aliases.map((alias) => alias.politician_id))];
  }

  const profileQuery = () => supabase.from("politicians")
    .select(PUBLIC_FIELDS)
    .is("canonical_politician_id", null)
    .eq("is_active", true)
    .eq("is_test", false);
  const states = filters.state ? stateRecordValues(filters.state) : null;
  const office = OFFICES.find((entry) => entry.value === filters.office);
  if (filters.office && !office) throw new DirectoryInputError("Choose a valid office.");
  const offices: readonly string[] | undefined = office?.records;

  let pageRows: DirectoryRow[];
  const mayorDirectory = filters.office === "mayor";
  let after: Omit<DirectoryCursor, "weekNumber" | "snapshot"> | undefined;
  if (snapshot !== undefined) {
    const ranking = await getHomepageRanking(snapshot);
    const term = filters.q.toLowerCase();
    const aliases = new Set(aliasIds);
    const rankedIds = new Set(ranking.map(([id]) => id));
    const available = [...ranking];
    // Search must also find mayors whose portraits have yet to be cleared.
    if (term && !offices && !filters.scope) {
      const nameFilter = `full_name.ilike.${quoteFilterValue(`%${escapeLike(filters.q)}%`)}`;
      let mayorQuery = profileQuery().eq("office", "Mayor")
        .or(aliasIds.length ? `${nameFilter},id.in.(${aliasIds.join(",")})` : nameFilter)
        .order("full_name").order("id").limit(100);
      if (states) mayorQuery = mayorQuery.in("state", states);
      const { data, error } = await mayorQuery.abortSignal(signal);
      if (error || !data) throw new Error("Mayor search unavailable");
      available.push(...data.filter(row => !rankedIds.has(row.id))
        .map((row): RankedProfile => [row.id, row.full_name, row.state, row.office]));
    }
    const results = available.filter(([id, name, state, office]) =>
      (!states || (state !== null && states.includes(state))) &&
      (!offices || (office !== null && offices.includes(office))) &&
      (!term || aliases.has(id) || name.toLowerCase().includes(term)));
    if (term) {
      const nameRank = (id: string, name: string) => {
        const lowerName = name.toLowerCase();
        if (lowerName === term || aliases.has(id)) return 0;
        return lowerName.startsWith(term) ? 1 : 2;
      };
      results.sort(([leftId, left], [rightId, right]) =>
        nameRank(leftId, left) - nameRank(rightId, right) || left.localeCompare(right) || leftId.localeCompare(rightId));
    }
    const position = cursor ? results.findIndex(([id]) => id === cursor.id) : -1;
    if (cursor && position < 0) throw new DirectoryInputError("This page link has expired. Start your search again.");
    const selection = results.slice(position + 1, position + 1 + DIRECTORY_PAGE_SIZE);
    const last = selection.at(-1);
    if (last && results.length > position + 1 + selection.length) after = { id: last[0], name: last[1] };
    if (!selection.length) return { people: [], nextCursor: null, weekNumber };
    const { data, error } = await profileQuery().in("id", selection.map(([id]) => id)).abortSignal(signal);
    if (error || !data) throw new Error("Directory records unavailable");
    const rows = new Map(data.map((row) => [row.id, row]));
    pageRows = selection.flatMap(([id]) => {
      const row = rows.get(id);
      return row && (row.office === "Mayor" || safePhotoUrl(row.photo_url)) ? [row] : [];
    });
  } else {
    const filterGroups: string[] = [];
    if (filters.q) {
      const term = quoteFilterValue(`%${escapeLike(filters.q)}%`);
      const searchFields = [`full_name.ilike.${term}`];
      if (mayorDirectory) searchFields.push(`district.ilike.${term}`);
      if (aliasIds.length) searchFields.push(`id.in.(${aliasIds.join(",")})`);
      filterGroups.push(searchFields.length === 1 ? searchFields[0]! : `or(${searchFields.join(",")})`);
    }
    if (cursor) {
      const name = quoteFilterValue(cursor.name);
      const nameOrder = `or(full_name.gt.${name},and(full_name.eq.${name},id.gt.${cursor.id}))`;
      const population = cursor.population;
      if (population === undefined) filterGroups.push(nameOrder);
      else if (population === null) filterGroups.push("mayor_city_population.is.null", nameOrder);
      else filterGroups.push(`or(mayor_city_population.lt.${population},mayor_city_population.is.null,and(mayor_city_population.eq.${population},${nameOrder}))`);
    }
    let query = profileQuery();
    if (mayorDirectory) query = query.order("mayor_city_population", { ascending: false, nullsFirst: false });
    query = query
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .limit(DIRECTORY_PAGE_SIZE + 1);
    if (filterGroups.length) query = query.or(`and(${filterGroups.join(",")})`);
    if (filters.scope === "national") query = query.in("office", NATIONAL_OFFICES);
    if (filters.scope === "executive") query = query.in("office", [...EXECUTIVE_OFFICES]);
    if (filters.scope === "state") query = query.in("office", STATE_OFFICES);
    if (states) query = query.in("state", states);
    if (offices) query = query.in("office", offices);
    const { data, error } = await query.abortSignal(signal);
    if (error || !data) throw new Error("Directory records unavailable");
    if (!cursor && !filters.q && !filters.state && !filters.office && !filters.scope && !data.length) {
      throw new Error("Public directory unexpectedly empty");
    }
    pageRows = data.slice(0, DIRECTORY_PAGE_SIZE);
    const last = pageRows.at(-1);
    if (last && data.length > DIRECTORY_PAGE_SIZE) {
      after = { name: last.full_name, id: last.id, population: mayorDirectory ? last.mayor_city_population : undefined };
    }
  }

  const nextCursor = after ? encodeDirectoryCursor({ ...after, weekNumber, snapshot }, filters) : null;
  if (!pageRows.length) return { people: [], nextCursor, weekNumber };
  const result = await supabase.rpc("identity_directory_counts", { p_ids: pageRows.map(row => row.id), p_week: weekNumber }).abortSignal(signal);
  if (result.error || !Array.isArray(result.data)) throw new Error("Directory identity counts unavailable");
  const counts = new Map<string, { questions: number; replies: number }>();
  for (const value of result.data) {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string" ||
        typeof value.questions !== "number" || !Number.isSafeInteger(value.questions) || value.questions < 0 ||
        typeof value.replies !== "number" || !Number.isSafeInteger(value.replies) || value.replies < 0 || value.replies > value.questions) {
      throw new Error("Invalid directory identity counts");
    }
    if (counts.has(value.id)) throw new Error("Duplicate directory counts");
    counts.set(value.id, { questions: value.questions, replies: value.replies });
  }
  const total = (id: string, key: "questions" | "replies") => {
    const count = counts.get(id);
    if (!count) throw new Error("Incomplete directory identity counts");
    return count[key];
  };
  const people: DirectoryPerson[] = pageRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    full_name: row.full_name,
    politician_type: row.politician_type,
    is_candidate: row.is_candidate,
    incumbent_challenge: row.incumbent_challenge,
    office: row.office,
    district: row.district,
    state: row.state,
    party: row.party,
    photo_url: safePhotoUrl(row.photo_url),
    questionCount: total(row.id, "questions"),
    replyCount: total(row.id, "replies"),
  }));
  return {
    people: snapshot === undefined && !mayorDirectory ? arrangeDirectoryPeople(people) : people,
    nextCursor,
    weekNumber,
  };
}), ["public-politician-directory-v7"], { revalidate: 300, tags: ["politician-directory"] });

/** All validation happens before consulting the public cache. */
export async function getDirectoryPage(filters: DirectoryFilters, cursor?: string, homepage = false): Promise<DirectoryPage> {
  const normalized = normalizeDirectoryFilters(filters);
  const decoded = decodeDirectoryCursor(cursor, normalized);
  const ranked = homepage && normalized.office !== "mayor";
  if (decoded && ranked !== (decoded.snapshot !== undefined)) {
    throw new DirectoryInputError("This page link has expired. Start your search again.");
  }
  // Continuing a directory keeps the same question cohort across a weekly reset.
  const weekNumber = decoded?.weekNumber ?? await getWeekNumber();
  const snapshot = ranked ? decoded?.snapshot ?? Math.floor(Date.now() / DIRECTORY_SNAPSHOT_MS) * DIRECTORY_SNAPSHOT_MS : undefined;
  return loadDirectoryPage(normalized, cursor ?? "", weekNumber, snapshot);
}
