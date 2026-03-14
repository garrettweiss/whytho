/**
 * OpenStates API client
 * Docs: https://docs.openstates.org/api-v3/
 */

const BASE_URL = "https://v3.openstates.org";
const API_KEY = process.env.OPENSTATES_API_KEY;

export interface OpenStatesPerson {
  id: string;
  name: string;
  party: string;
  current_role?: {
    title: string;
    org_classification: string;
    district: string;
    division_id: string;
    state: string;
    chamber: string;
  };
  other_names?: Array<{ name: string }>;
  image?: string;
  links?: Array<{ url: string; note: string }>;
  ids?: {
    bioguide?: string;
    openstates?: string;
  };
  jurisdiction?: {
    id: string;
    name: string;
    classification: string;
  };
}

// Phase 1: 10 target states
export const TARGET_STATES = [
  "ca", "tx", "fl", "ny", "pa",
  "oh", "ga", "nc", "mi", "az",
] as const;

export type TargetState = (typeof TARGET_STATES)[number];

async function fetchWithRetry(
  url: string,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      headers: { "X-API-KEY": API_KEY ?? "" },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
      continue;
    }
    return res;
  }
  throw new Error(`Failed after ${retries} retries`);
}

export async function fetchStateLegislators(
  state: TargetState
): Promise<OpenStatesPerson[]> {
  if (!API_KEY) throw new Error("OPENSTATES_API_KEY not set");

  const people: OpenStatesPerson[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${BASE_URL}/people?jurisdiction=${state}&page=${page}&per_page=${perPage}&org_classification=legislature`;
    const res = await fetchWithRetry(url);

    if (!res.ok) {
      throw new Error(`OpenStates API error: ${res.status} for state ${state}`);
    }

    const data = (await res.json()) as {
      results: OpenStatesPerson[];
      pagination: { total_pages: number };
    };

    people.push(...data.results);

    if (page >= data.pagination.total_pages) break;
    page++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return people;
}

export async function fetchAllTargetStateLegislators(): Promise<
  Map<TargetState, OpenStatesPerson[]>
> {
  const results = new Map<TargetState, OpenStatesPerson[]>();

  for (const state of TARGET_STATES) {
    console.log(`Fetching legislators for ${state}...`);
    const legislators = await fetchStateLegislators(state);
    results.set(state, legislators);
    console.log(`  → ${legislators.length} legislators`);
    // Respect rate limit: 1000 req/day on free tier
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

export function mapPartyName(party: string): string {
  const normalized = party.toLowerCase();
  if (normalized.includes("democrat")) return "Democrat";
  if (normalized.includes("republican")) return "Republican";
  if (normalized.includes("independent")) return "Independent";
  if (normalized.includes("green")) return "Green";
  if (normalized.includes("libertarian")) return "Libertarian";
  return party;
}

export function mapChamberTitle(
  classification: string,
  title: string,
  state: string
): string {
  if (classification === "upper") return `State Senator — ${state.toUpperCase()}`;
  if (classification === "lower") return `State Representative — ${state.toUpperCase()}`;
  return `${title} — ${state.toUpperCase()}`;
}
