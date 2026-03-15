/**
 * Politician data normalization pipeline
 * Merges data from multiple civic sources into the politicians DB schema
 */

import type { TablesInsert } from "@/types/database";
import type { CongressMember } from "./congress";
import type { OpenStatesPerson } from "./openstates";
import {
  getBioguidePhotoUrl,
  mapChamberToOffice,
} from "./congress";
import { mapPartyName, mapChamberTitle } from "./openstates";

/** Extract 2-letter state code from OCD jurisdiction ID.
 *  e.g. "ocd-jurisdiction/country:us/state:ca/legislature" → "CA"
 */
function extractStateFromJurisdiction(jurisdictionId: string): string {
  const match = /\/state:([a-z]{2})\//.exec(jurisdictionId);
  return match?.[1]?.toUpperCase() ?? "";
}

type PoliticianInsert = TablesInsert<"politicians">;
type AliasInsert = TablesInsert<"politician_aliases">;

export interface NormalizedPolitician {
  politician: PoliticianInsert;
  aliases: Omit<AliasInsert, "politician_id">[];
}

// Slug is generated once and never changed — collision-safe
export function generateSlug(fullName: string, state: string, suffix?: string): string {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  const stateSlug = state.toLowerCase();
  const slug = `${base}-${stateSlug}`;

  return suffix ? `${slug}-${suffix}` : slug;
}

export function normalizeCongressMember(
  member: CongressMember
): NormalizedPolitician {
  const fullName = member.name;
  const nameParts = fullName.split(", ");
  // Congress.gov returns "LastName, FirstName" format
  const lastName = nameParts[0] ?? "";
  const firstName = nameParts[1] ?? "";
  const displayName = firstName ? `${firstName} ${lastName}` : fullName;

  const slug = generateSlug(displayName, member.state);

  // Congress.gov list endpoint doesn't include top-level chamber — derive from most recent term
  const sortedTerms = [...(member.terms?.item ?? [])].sort(
    (a, b) => b.startYear - a.startYear
  );
  const currentChamber = sortedTerms[0]?.chamber ?? member.chamber ?? "House of Representatives";
  const titlePrefix = currentChamber === "Senate" ? "Sen." : "Rep.";

  const aliases: Omit<AliasInsert, "politician_id">[] = [];

  // Add "Rep." / "Sen." title aliases
  aliases.push({
    alias: `${titlePrefix} ${displayName}`,
    alias_type: "title",
  });
  aliases.push({
    alias: `${titlePrefix} ${lastName}`,
    alias_type: "title",
  });

  // Last name only as informal alias
  if (lastName) {
    aliases.push({ alias: lastName, alias_type: "informal" });
  }

  const politician: PoliticianInsert = {
    slug,
    full_name: displayName,
    aliases: [displayName, `${titlePrefix} ${displayName}`, lastName].filter(Boolean),
    office: mapChamberToOffice(currentChamber),
    state: member.state,
    district: member.district ? String(member.district) : null,
    party: member.party === "D" ? "Democrat" : member.party === "R" ? "Republican" : member.party,
    photo_url: member.bioguideId ? getBioguidePhotoUrl(member.bioguideId) : null,
    bioguide_id: member.bioguideId ?? null,
    website_url: member.officialWebsiteUrl ?? null,
    social_handles: {},
    verification_tier: "0",
    is_active: true,
  };

  return { politician, aliases };
}

export function normalizeOpenStatesPerson(
  person: OpenStatesPerson
): NormalizedPolitician {
  const fullName = person.name;
  // current_role.state is often absent in OpenStates API responses;
  // fall back to jurisdiction.id which reliably contains the state code
  const stateFromRole = person.current_role?.state?.toLowerCase() ?? "";
  const stateFromJurisdiction = person.jurisdiction?.id
    ? extractStateFromJurisdiction(person.jurisdiction.id)
    : "";
  const state = (stateFromRole || stateFromJurisdiction).toLowerCase();
  const slug = generateSlug(fullName, state);

  const aliases: Omit<AliasInsert, "politician_id">[] = [];

  // Other names from OpenStates
  for (const other of person.other_names ?? []) {
    aliases.push({ alias: other.name, alias_type: "nickname" });
  }

  // Extract last name for informal alias
  const nameParts = fullName.trim().split(" ");
  const lastName = nameParts[nameParts.length - 1] ?? "";
  if (lastName && lastName !== fullName) {
    aliases.push({ alias: lastName, alias_type: "informal" });
  }

  const role = person.current_role;
  const officialWebsite = person.links?.find((l) => l.note === "Official Website")?.url ?? null;

  const politician: PoliticianInsert = {
    slug,
    full_name: fullName,
    aliases: [fullName, ...(person.other_names?.map((n) => n.name) ?? [])],
    office: role
      ? mapChamberTitle(role.org_classification, role.title)
      : null,
    state: state.toUpperCase(),
    district: role?.district ?? null,
    party: mapPartyName(person.party),
    photo_url: person.image ?? null,
    openstates_id: person.id ?? null,
    bioguide_id: person.ids?.bioguide ?? null,
    website_url: officialWebsite,
    social_handles: {},
    verification_tier: "0",
    is_active: true,
  };

  return { politician, aliases };
}

export function deduplicatePoliticians(
  politicians: NormalizedPolitician[]
): NormalizedPolitician[] {
  const seen = new Set<string>();
  const deduped: NormalizedPolitician[] = [];

  for (const p of politicians) {
    // Deduplicate by bioguide_id first (most reliable), then by slug
    const key = p.politician.bioguide_id ?? p.politician.slug;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }

  return deduped;
}

// Make slug unique if collision detected (called during DB upsert)
export function makeSlugUnique(slug: string, existingSlugs: Set<string>): string {
  if (!existingSlugs.has(slug)) return slug;

  let counter = 2;
  while (existingSlugs.has(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}
