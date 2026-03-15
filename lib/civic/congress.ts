/**
 * Congress.gov API client
 * Docs: https://api.congress.gov/
 */

const BASE_URL = "https://api.congress.gov/v3";
const API_KEY = process.env.CONGRESS_API_KEY;

export interface CongressMember {
  bioguideId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  party: string;
  state: string;
  district?: number;
  chamber: "Senate" | "House of Representatives";
  terms?: {
    item: Array<{
      chamber: string;
      startYear: number;
      endYear?: number;
    }>;
  };
  url?: string;
  officialWebsiteUrl?: string;
  depiction?: {
    imageUrl?: string;
    attribution?: string;
  };
}

export interface CongressMemberDetail extends CongressMember {
  birthYear?: number;
  address?: {
    office?: string;
    city?: string;
    district?: string;
    zip?: string;
    phoneNumber?: string;
  };
}

async function fetchWithRetry(
  url: string,
  retries = 3,
  delayMs = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      // Rate limited — wait and retry
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
      continue;
    }
    return res;
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

export async function fetchAllMembers(): Promise<CongressMember[]> {
  if (!API_KEY) throw new Error("CONGRESS_API_KEY not set");

  const members: CongressMember[] = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const url = `${BASE_URL}/member?api_key=${API_KEY}&limit=${limit}&offset=${offset}&currentMember=true&format=json`;
    const res = await fetchWithRetry(url);

    if (!res.ok) {
      throw new Error(`Congress API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      members: CongressMember[];
      pagination: { count: number; next?: string };
    };

    members.push(...data.members);

    if (!data.pagination.next || members.length >= data.pagination.count) {
      break;
    }

    offset += limit;
    // Respect rate limits: 5000 req/hour = ~1.4/sec
    await new Promise((r) => setTimeout(r, 250));
  }

  return members;
}

export async function fetchMemberDetail(
  bioguideId: string
): Promise<CongressMemberDetail | null> {
  if (!API_KEY) throw new Error("CONGRESS_API_KEY not set");

  const url = `${BASE_URL}/member/${bioguideId}?api_key=${API_KEY}&format=json`;
  const res = await fetchWithRetry(url);

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Congress API error: ${res.status}`);

  const data = (await res.json()) as { member: CongressMemberDetail };
  return data.member;
}

export function getBioguidePhotoUrl(bioguideId: string): string {
  // Official congressional photos — free, no API key
  const letter = bioguideId[0]?.toUpperCase() ?? "A";
  return `https://bioguide.congress.gov/bioguide/photo/${letter}/${bioguideId}.jpg`;
}

export function mapChamberToOffice(chamber: string): string {
  return chamber === "Senate" ? "U.S. Senator" : "U.S. Representative";
}
