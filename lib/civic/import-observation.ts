import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { importPoliticianIdentity } from "../identity/import";
import { resolvePoliticianIdentity } from "../identity/client";
import {
  normalizeDistrict, normalizeFecName, normalizeStateCode,
  type NormalizedPolitician,
} from "./normalize";

export type CivicObservation = Parameters<typeof importPoliticianIdentity>[1];

/** Preview is always the default. Conflicting flags must not silently enable writes. */
export function shouldApplyImport(args: readonly string[]): boolean {
  if (args.includes("--apply") && args.includes("--dry-run")) {
    throw new Error("Choose --apply or --dry-run, not both");
  }
  return args.includes("--apply");
}

export interface FecSourceCandidate {
  candidate_id: string;
  name: string | null;
  office: string;
  state: string;
  district: string | null;
  party: string | null;
  incumbent_challenge: string | null;
  candidate_status?: string;
}

const FEC_OFFICES: Record<string, string> = {
  H: "U.S. Representative", S: "U.S. Senator", P: "President",
};
const FEC_PARTIES: Record<string, string> = {
  DEM: "Democrat", REP: "Republican", IND: "Independent", LIB: "Libertarian",
  GRE: "Green", CON: "Constitution", NNE: "No Party", UNK: "Unknown",
};

export function fecObservation(
  candidate: FecSourceCandidate,
  electionYear: number,
  raceId?: string | null
): CivicObservation {
  if (!candidate.candidate_id?.trim() || !candidate.name?.trim()) {
    throw new Error("FEC observation requires a provider ID and full name");
  }
  const office = FEC_OFFICES[candidate.office];
  if (!office) throw new Error(`Unsupported FEC office: ${candidate.office}`);
  if (!Number.isInteger(electionYear) || electionYear < 1900) throw new Error("Invalid election year");
  const party = candidate.party?.trim();
  return {
    namespace: "fec.candidate",
    externalId: candidate.candidate_id.trim().toUpperCase(),
    sourceUrl: `https://www.fec.gov/data/candidate/${encodeURIComponent(candidate.candidate_id.trim().toUpperCase())}/`,
    record: {
      full_name: normalizeFecName(candidate.name),
      state: candidate.office === "P" ? "DC" : normalizeStateCode(candidate.state),
      office,
      district: candidate.office === "H" ? normalizeDistrict(candidate.district) : null,
      party: party ? FEC_PARTIES[party.toUpperCase()] ?? party : null,
      is_candidate: true,
      candidate_election_year: electionYear,
      candidate_office: office,
      incumbent_challenge: candidate.incumbent_challenge,
      candidate_status: candidate.candidate_status ?? null,
      race_id: raceId ?? null,
    },
  };
}

export function officialObservation(normalized: NormalizedPolitician): CivicObservation {
  const { politician, aliases } = normalized;
  const externalId = politician.openstates_id || politician.bioguide_id;
  if (!externalId) throw new Error(`Missing provider ID for ${politician.full_name}`);
  const isOpenStates = Boolean(politician.openstates_id);
  const sourceUrl = isOpenStates
    ? `https://openstates.org/person/${encodeURIComponent(externalId)}/`
    : `https://bioguide.congress.gov/search/bio/${encodeURIComponent(externalId)}`;
  return {
    namespace: isOpenStates ? "openstates.person" : "congress.bioguide",
    externalId,
    sourceUrl,
    record: {
      full_name: politician.full_name,
      state: normalizeStateCode(politician.state ?? ""),
      office: politician.office ?? null,
      district: normalizeDistrict(politician.district),
      party: politician.party ?? null,
      website_url: politician.website_url ?? null,
      aliases: [...new Set([...(politician.aliases ?? []), ...aliases.map((alias) => alias.alias)])],
      bioguide_id: politician.bioguide_id ?? null,
      // Portraits remain private source evidence until the reviewed portrait
      // pipeline approves rights. Existing public portraits are never replaced.
      photo_url: politician.photo_url ?? null,
      photo_source_url: sourceUrl,
    },
  };
}

/** All writers share a single provider namespace and transactional SQL resolver. */
export async function importCivicObservation(
  client: Parameters<typeof importPoliticianIdentity>[0],
  observation: CivicObservation,
  apply = false
) {
  // A failed request must propagate. There is deliberately no insert fallback.
  return importPoliticianIdentity(client, observation, { apply });
}

type Incumbent = { id: string; state: string | null; district: string | null };

/** An ambiguous incumbent is an error; row order must never decide identity. */
export async function findCanonicalIncumbent(
  client: SupabaseClient<Database>,
  office: string,
  state: string,
  district: string | null = null
): Promise<string | null> {
  const targetState = normalizeStateCode(state);
  const targetDistrict = normalizeDistrict(district);
  const matches: Incumbent[] = [];
  // Historical rows can contain state names or codes. Scan the exact office
  // in stable <=1000-row pages, then compare normalized seats.
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("politicians")
      .select("id,state,district")
      .eq("office", office).eq("is_active", true).eq("is_test", false)
      .eq("politician_type", "elected").order("id").range(start, start + 999);
    if (error) throw new Error(`Incumbent lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      if (!row.state || normalizeStateCode(row.state) !== targetState) continue;
      if (office === "U.S. Representative" && normalizeDistrict(row.district) !== targetDistrict) continue;
      matches.push(row);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  const canonicalIds = new Set<string>();
  for (const match of matches) {
    const resolved = await resolvePoliticianIdentity(match.id, client);
    if (!resolved) throw new Error(`Missing incumbent identity: ${match.id}`);
    canonicalIds.add(resolved.canonicalId);
  }
  if (canonicalIds.size > 1) {
    throw new Error(`Ambiguous incumbent for ${targetState} ${office} ${targetDistrict ?? ""}`);
  }
  return [...canonicalIds][0] ?? null;
}

/** FEC has no verified primary date. Link a known race instead of inventing one. */
export async function findExistingFederalRace(
  client: SupabaseClient<Database>,
  observation: CivicObservation,
  electionYear: number
): Promise<string | null> {
  const { office, state, district } = observation.record;
  if (office !== "U.S. Representative" && office !== "U.S. Senator") return null;
  if (office === "U.S. Representative" && district == null) return null;
  const slug = office === "U.S. Senator"
    ? `${state.toLowerCase()}-senate-primary-${electionYear}`
    : `${state.toLowerCase()}-house-${String(district).padStart(2, "0")}-primary-${electionYear}`;
  const { data, error } = await client.from("races").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Race lookup failed: ${error.message}`);
  return data?.id ?? null;
}
