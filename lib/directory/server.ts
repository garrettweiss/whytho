import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { decodeDirectoryCursor, encodeDirectoryCursor } from "./cursor";
import { EXECUTIVE_OFFICES, NATIONAL_OFFICES, STATE_OFFICES } from "./scope";
import { arrangeDirectoryPeople } from "./presentation";
import { escapeLike, normalizeDirectoryFilters, OFFICES, quoteFilterValue, stateRecordValues } from "./search";
import { DIRECTORY_PAGE_SIZE, DirectoryInputError, type DirectoryFilters, type DirectoryPage, type DirectoryPerson } from "./types";

const TIMEOUT_MS = 8_000;
const PUBLIC_FIELDS = "id,slug,full_name,politician_type,is_candidate,incumbent_challenge,office,state,party,photo_url";

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

const loadDirectoryPage = unstable_cache(async (
  filters: DirectoryFilters,
  cursorValue: string,
  weekNumber: number,
): Promise<DirectoryPage> => boundedRead(async (signal) => {
  const supabase = createPublicClient();
  const cursor = decodeDirectoryCursor(cursorValue, filters);
  const filterGroups: string[] = [];

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
    const aliasIds = [...new Set(aliases.map((alias) => alias.politician_id))];
    const nameFilter = `full_name.ilike.${quoteFilterValue(`%${escapeLike(filters.q)}%`)}`;
    filterGroups.push(aliasIds.length ? `or(${nameFilter},id.in.(${aliasIds.join(",")}))` : nameFilter);
  }

  if (cursor) {
    const name = quoteFilterValue(cursor.name);
    filterGroups.push(`or(full_name.gt.${name},and(full_name.eq.${name},id.gt.${cursor.id}))`);
  }

  let query = supabase.from("politicians")
    .select(PUBLIC_FIELDS)
    .is("canonical_politician_id", null)
    .eq("is_active", true)
    .eq("is_test", false)
    .order("full_name", { ascending: true })
    .order("id", { ascending: true })
    .limit(DIRECTORY_PAGE_SIZE + 1);

  if (filterGroups.length) query = query.or(`and(${filterGroups.join(",")})`);
  if (filters.scope === "national") query = query.in("office", NATIONAL_OFFICES);
  if (filters.scope === "executive") query = query.in("office", [...EXECUTIVE_OFFICES]);
  if (filters.scope === "state") query = query.in("office", STATE_OFFICES);
  if (filters.state) query = query.in("state", stateRecordValues(filters.state));
  if (filters.office) {
    const office = OFFICES.find((entry) => entry.value === filters.office);
    if (!office) throw new DirectoryInputError("Choose a valid office.");
    query = query.in("office", [...office.records]);
  }

  const { data, error } = await query.abortSignal(signal);
  if (error || !data) throw new Error("Directory records unavailable");
  if (!cursor && !filters.q && !filters.state && !filters.office && !filters.scope && !data.length) {
    throw new Error("Public directory unexpectedly empty");
  }

  const pageRows = data.slice(0, DIRECTORY_PAGE_SIZE);
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
  const people: DirectoryPerson[] = data.slice(0, DIRECTORY_PAGE_SIZE).map((row) => ({
    id: row.id,
    slug: row.slug,
    full_name: row.full_name,
    politician_type: row.politician_type,
    is_candidate: row.is_candidate,
    incumbent_challenge: row.incumbent_challenge,
    office: row.office,
    state: row.state,
    party: row.party,
    photo_url: safePhotoUrl(row.photo_url),
    questionCount: total(row.id, "questions"),
    replyCount: total(row.id, "replies"),
  }));
  const lastPerson = people.at(-1);
  const nextCursor = data.length > DIRECTORY_PAGE_SIZE && lastPerson
    ? encodeDirectoryCursor({ name: lastPerson.full_name, id: lastPerson.id, weekNumber }, filters)
    : null;
  return {
    // Cursor follows database order; presentation order never drives pagination.
    people: arrangeDirectoryPeople(people),
    nextCursor,
    weekNumber,
  };
}), ["public-politician-directory-identity-v5"], { revalidate: 300, tags: ["politician-directory"] });

/** All validation happens before consulting the public cache. */
export async function getDirectoryPage(filters: DirectoryFilters, cursor?: string): Promise<DirectoryPage> {
  const normalized = normalizeDirectoryFilters(filters);
  const decoded = decodeDirectoryCursor(cursor, normalized);
  // Continuing a directory keeps the same question cohort across a weekly reset.
  const weekNumber = decoded?.weekNumber ?? await getWeekNumber();
  return loadDirectoryPage(normalized, cursor ?? "", weekNumber);
}
