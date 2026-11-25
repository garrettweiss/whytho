/**
 * Build local identity-review evidence from explicit Bioguide/FEC crosswalk IDs.
 * Usage: node scripts/review-politician-crosswalk.mjs [captured-audit-directory]
 * No network access, database writes, profile edits, or approval of name matches.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] || "outputs/politician-identity-audit-20261122");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const normalizeId = value => String(value ?? "").trim().toUpperCase();
const present = value => value != null && value !== "" && (typeof value !== "object" || Object.keys(value).length > 0);
const unique = values => [...new Set(values)].sort();
const normalizedParty = value => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["democrat", "democratic", "dem", "d"].includes(raw)) return "Democrat";
  if (["republican", "rep", "r", "gop"].includes(raw)) return "Republican";
  if (["independent", "ind", "i"].includes(raw)) return "Independent";
  if (["libertarian", "lib"].includes(raw)) return "Libertarian";
  if (["green", "gre"].includes(raw)) return "Green";
  return null;
};
const fecColumns = ["fec_id", "fec_candidate_id", "candidate_fec_id"];
const authorityCounts = ["politician_team", "politician_verifications", "politician_verification_sources", "official_answers", "answers"];
const usefulFields = ["photo_url", "photo_source_url", "photo_credit", "photo_rights_basis", "bio", "party", "website_url", "social_handles", "aliases"];
const inputs = ["politicians.json", "capture.json", "relationships.json", "review-manifest.json", "supplemental-name-review.json", "legislators-current.json", "legislators-historical.json"];
const files = Object.fromEntries(await Promise.all(inputs.map(async filename => {
  const text = await readFile(resolve(directory, filename), "utf8");
  return [filename, { value: JSON.parse(text), sha256: sha256(text) }];
})));
const rows = files["politicians.json"].value;
const capture = files["capture.json"].value;
const relationships = files["relationships.json"].value;
const reviewManifest = files["review-manifest.json"].value;
const supplemental = files["supplemental-name-review.json"].value;
if (!Array.isArray(rows) || rows.length !== capture.rowCount || new Set(rows.map(row => row.id)).size !== rows.length ||
    sha256(JSON.stringify(rows)) !== capture.sha256) throw new Error("Politician capture hash/count/identity check failed");
if (!relationships.byId || !Array.isArray(reviewManifest) || !Array.isArray(supplemental)) throw new Error("Incomplete local audit evidence");

const crosswalkSources = [
  { filename: "legislators-current.json", url: "https://unitedstates.github.io/congress-legislators/legislators-current.json" },
  { filename: "legislators-historical.json", url: "https://unitedstates.github.io/congress-legislators/legislators-historical.json" },
];
const people = new Map();
const fecPeople = new Map();
for (const source of crosswalkSources) {
  const entries = files[source.filename].value;
  if (!Array.isArray(entries)) throw new Error(`Invalid crosswalk: ${source.filename}`);
  for (const entry of entries) {
    const bioguide = normalizeId(entry.id?.bioguide);
    if (!bioguide) continue;
    const person = people.get(bioguide) ?? { bioguide, fec: new Set(), govtrack: new Set(), votesmart: new Set(), sources: [], terms: [] };
    for (const term of entry.terms ?? []) person.terms.push({ term, source_url: source.url, file_sha256: files[source.filename].sha256 });
    for (const field of ["govtrack", "votesmart"]) {
      if (present(entry.id[field])) person[field].add(normalizeId(entry.id[field]));
    }
    const fecIds = Array.isArray(entry.id.fec) ? entry.id.fec.map(normalizeId).filter(Boolean) : [];
    for (const id of fecIds) {
      person.fec.add(id);
      const matches = fecPeople.get(id) ?? new Set();
      matches.add(bioguide);
      fecPeople.set(id, matches);
    }
    person.sources.push({
      url: source.url, file_sha256: files[source.filename].sha256,
      entry_sha256: sha256(JSON.stringify(entry)), bioguide_id: bioguide, fec_ids: unique(fecIds),
      source_name: entry.name?.official_full ?? [entry.name?.first, entry.name?.middle, entry.name?.last, entry.name?.suffix].filter(Boolean).join(" "),
    });
    people.set(bioguide, person);
  }
}

// Explicit identifier connections alone define groups. Names, state, office and
// district are retained for review context and never create an identity edge.
const membersByPerson = new Map();
const resolvedRowPeople = new Map();
const poisonedPeople = new Map();
const rowHolds = [];
for (const row of rows) {
  const matches = new Set();
  const reasons = [];
  const bioguide = normalizeId(row.bioguide_id);
  const fces = unique(fecColumns.map(field => normalizeId(row[field])).filter(Boolean));
  if (bioguide) {
    if (people.has(bioguide)) matches.add(bioguide);
    else reasons.push(`unverified_bioguide_id:${bioguide}`);
  }
  for (const fec of fces) {
    const candidates = fecPeople.get(fec);
    if (!candidates) {
      if (bioguide) reasons.push(`unverified_fec_id:${fec}`);
      continue;
    }
    for (const match of candidates) matches.add(match);
    if (candidates.size !== 1) reasons.push(`ambiguous_crosswalk_fec_id:${fec}`);
  }
  if (!matches.size) continue;
  if (matches.size !== 1) reasons.push("conflicting_primary_provider_identities");
  if (reasons.length) {
    rowHolds.push({ id: row.id, full_name: row.full_name, possible_bioguide_ids: unique(matches), reasons });
    for (const match of matches) {
      const held = poisonedPeople.get(match) ?? [];
      held.push({ id: row.id, reasons });
      poisonedPeople.set(match, held);
    }
    continue;
  }
  const key = [...matches][0];
  resolvedRowPeople.set(row.id, key);
  const members = membersByPerson.get(key) ?? [];
  members.push(row);
  membersByPerson.set(key, members);
}

const score = row => {
  const counts = relationships.byId[row.id] ?? {};
  return [
    Number(row.verification_tier), +(counts.politician_team > 0), +(counts.official_answers > 0),
    +((counts.user_questions ?? 0) + (counts.votes ?? 0) > 0), +Boolean(row.bioguide_id),
    +Boolean(row.openstates_id && !row.is_candidate), +(counts.questions > 0),
    +(counts.weekly_snapshots > 0), +Boolean(row.photo_url), usefulFields.filter(field => present(row[field])).length,
  ];
};
function rank(left, right) {
  const a = score(left), b = score(right);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return String(left.created_at).localeCompare(String(right.created_at)) || left.id.localeCompare(right.id);
}
const fingerprint = row => sha256(JSON.stringify(row));
function reviewedParty(person, canonical, candidates) {
  if (present(canonical.party)) return { status: "preserve_existing", reason: "Canonical party is already populated" };
  const date = capture.finishedAt?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: "held", reason: "Missing dated capture for current-term verification" };
  const type = canonical.office === "U.S. Representative" ? "rep" : canonical.office === "U.S. Senator" ? "sen" : null;
  const currentTerms = person.terms.filter(({ term }) => term.type === type && term.start <= date && date < term.end);
  const proofs = [];
  for (const { term, source_url, file_sha256 } of currentTerms) {
    const affiliations = term.party_affiliations?.filter(affiliation => affiliation.start <= date && date < affiliation.end);
    if (affiliations && affiliations.length !== 1) return { status: "held", reason: "Ambiguous dated party affiliation" };
    const party = normalizedParty(affiliations?.[0]?.party ?? term.party);
    if (!party) return { status: "held", reason: "Unrecognized current-term party" };
    proofs.push({ party, as_of: date, source_url, file_sha256, term: {
      type: term.type, state: term.state, district: term.district ?? null,
      start: term.start, end: term.end, party: term.party,
      effective_affiliation: affiliations?.[0] ?? null,
    } });
  }
  if (!proofs.length || unique(proofs.map(proof => proof.party)).length !== 1) return { status: "held", reason: "No unambiguous current Congress term for canonical office" };
  const donors = candidates.filter(row => row.id !== canonical.id && present(row.party));
  if (!donors.length) return { status: "held", reason: "No populated donor party" };
  if (donors.some(row => normalizedParty(row.party) !== proofs[0].party)) return { status: "held", reason: "Candidate donor party conflicts with dated Congress term" };
  return { status: "verified_missing_field_fill", value: proofs[0].party, proofs,
    donors: donors.map(row => ({ id: row.id, party: row.party, normalized_party: normalizedParty(row.party) })) };
}
const decisionId = value => {
  const hash = sha256(value).slice(0, 32).split("");
  hash[12] = "5";
  hash[16] = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  const hex = hash.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const groups = [], heldGroups = [], links = [];
for (const [bioguide, candidates] of [...membersByPerson.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (candidates.length < 2) continue;
  const person = people.get(bioguide);
  const ids = new Set(candidates.map(row => row.id));
  const reasons = [];
  if (poisonedPeople.has(bioguide)) reasons.push("another_profile_has_conflicting_identity_evidence");
  const rejected = reviewManifest.filter(group => group.status.startsWith("rejected") && group.ids.filter(id => ids.has(id)).length > 1);
  if (rejected.length) reasons.push("previously_rejected_pair_requires_manual_review");
  for (const row of candidates) {
    const counts = relationships.byId[row.id];
    if (row.is_test !== false) reasons.push(`test_or_unknown_test_status:${row.id}`);
    if (row.is_active !== true) reasons.push(`inactive_or_unknown_activity:${row.id}`);
    if (row.verification_tier !== "0") reasons.push(`claimed_or_unknown_verification_tier:${row.id}`);
    if (!counts || authorityCounts.some(field => typeof counts[field] !== "number")) reasons.push(`authority_capture_missing:${row.id}`);
    else if (authorityCounts.some(field => counts[field] > 0)) reasons.push(`authority_or_answers_require_manual_review:${row.id}`);
    if (row.canonical_politician_id) reasons.push(`already_linked_identity_requires_fresh_review:${row.id}`);
    for (const field of ["govtrack", "votesmart"]) {
      const value = normalizeId(row[`${field}_id`]);
      if (value && !person[field].has(value)) reasons.push(`conflicting_or_unverified_${field}_id:${row.id}`);
    }
    for (const fec of fecColumns.map(field => normalizeId(row[field])).filter(Boolean)) {
      if (!person.fec.has(fec)) reasons.push(`unverified_additional_fec_id:${row.id}`);
    }
  }
  for (const field of ["openstates_id", "govtrack_id", "votesmart_id"]) {
    if (new Set(candidates.map(row => normalizeId(row[field])).filter(Boolean)).size > 1) reasons.push(`conflicting_${field}`);
  }
  const coreGroups = reviewManifest.filter(group => group.ids.some(id => ids.has(id)));
  if (reasons.length) {
    heldGroups.push({ bioguide_id: bioguide, ids: unique(ids), names: unique(candidates.map(row => row.full_name)), reasons: unique(reasons),
      related_core_group_ids: coreGroups.map(group => group.group_id), conflicting_profiles: poisonedPeople.get(bioguide) ?? [] });
    continue;
  }
  candidates.sort(rank);
  const suggestedAnchors = unique(coreGroups.map(group => group.suggested_anchor_if_identity_confirmed?.id).filter(id => ids.has(id)));
  const rankedAnchor = candidates[0];
  // Keep the audit's stable URL if its recorded suggestion remains the strongest
  // profile. A newly discovered stronger profile wins by the same explicit rank.
  const suggested = suggestedAnchors.length === 1 ? candidates.find(row => row.id === suggestedAnchors[0]) : null;
  const canonical = suggested && rank(suggested, rankedAnchor) <= 0 ? suggested : rankedAnchor;
  const partyReview = reviewedParty(person, canonical, candidates);
  const coreGroupIds = coreGroups.map(group => group.group_id);
  const group = {
    bioguide_id: bioguide, canonical_id: canonical.id, canonical_slug: canonical.slug, ids: unique(ids),
    names: unique(candidates.map(row => row.full_name)), core_group_ids: coreGroupIds,
    anchor_reason: suggested?.id === canonical.id ? "Preserved the strongest audit-suggested permanent profile" : "Ranked authority, participation, official identifiers, established content, populated fields, then oldest permanent URL",
    status: "verified_provider_crosswalk_pending_live_review", approved_to_apply: false,
    sources: person.sources,
    field_review: { party: partyReview },
  };
  groups.push(group);
  for (const source of candidates.filter(row => row.id !== canonical.id).sort((a, b) => a.id.localeCompare(b.id))) {
    const evidence = {
      approved_to_apply: false,
      method: "explicit_bioguide_fec_crosswalk",
      bioguide_id: bioguide,
      source_urls: unique(person.sources.map(entry => entry.url)), crosswalk_entries: person.sources,
      source_provider_ids: Object.fromEntries(["bioguide_id", ...fecColumns, "openstates_id", "govtrack_id", "votesmart_id"].map(field => [field, source[field] ?? null])),
      canonical_provider_ids: Object.fromEntries(["bioguide_id", ...fecColumns, "openstates_id", "govtrack_id", "votesmart_id"].map(field => [field, canonical[field] ?? null])),
      source_profile_sha256: fingerprint(source), canonical_profile_sha256: fingerprint(canonical),
      audit_capture_sha256: capture.sha256, relationships_sha256: files["relationships.json"].sha256,
      core_group_ids: coreGroupIds,
      field_provenance: partyReview.status === "verified_missing_field_fill" ? { party: partyReview } : {},
      pre_apply_requirements: ["Explicit operator approval", "Fresh live identity, authority and provider conflict check", "Fresh transactional politician_identity_dependency_counts for the whole group", "Compare both updated_at timestamps; reject changed profiles"],
    };
    links.push({
      decision_id: decisionId(`${capture.sha256}:${source.id}:${canonical.id}:${person.sources.map(entry => entry.entry_sha256).join(":")}`),
      source_id: source.id, source_slug: source.slug, source_name: source.full_name,
      canonical_id: canonical.id, canonical_slug: canonical.slug, canonical_name: canonical.full_name,
      source_updated_at: source.updated_at, canonical_updated_at: canonical.updated_at,
      approved_to_apply: false, requires_live_revalidation: true,
      evidence, fields: partyReview.status === "verified_missing_field_fill" ? { party: partyReview.value } : {},
      captured_relationship_counts: { [source.id]: relationships.byId[source.id], [canonical.id]: relationships.byId[canonical.id] },
    });
  }
}

const verifiedById = new Map(groups.flatMap(group => group.ids.map(id => [id, group.bioguide_id])));
const fullyVerified = ids => ids.length > 1 && ids.every(id => verifiedById.has(id)) && new Set(ids.map(id => verifiedById.get(id))).size === 1;
const distinctCrosswalkPeople = ids => ids.every(id => resolvedRowPeople.has(id)) && new Set(ids.map(id => resolvedRowPeople.get(id))).size > 1;
const strongCohort = reviewManifest.filter(group => group.tier === "strong_cross_source_candidate");
const cohortReview = reviewManifest.map(group => ({
  group_id: group.group_id, tier: group.tier, ids: group.ids,
  status: group.status.startsWith("rejected") ? "preserved_prior_rejection"
    : distinctCrosswalkPeople(group.ids) ? "rejected_distinct_crosswalk_people"
      : fullyVerified(group.ids) ? "verified_explicit_provider_crosswalk" : "not_verified_by_crosswalk",
  explicit_person_ids: Object.fromEntries(group.ids.filter(id => resolvedRowPeople.has(id)).map(id => [id, resolvedRowPeople.get(id)])),
}));
const coreIds = new Set(reviewManifest.flatMap(group => group.ids));
const summary = {
  captured_politicians: rows.length, provider_matched_people_with_multiple_profiles: groups.length + heldGroups.length,
  verified_identity_groups: groups.length, verified_profiles: groups.reduce((sum, group) => sum + group.ids.length, 0),
  proposed_source_to_canonical_links: links.length, held_identity_groups: heldGroups.length, held_conflicting_profiles: rowHolds.length,
  original_strong_cohort_groups: strongCohort.length,
  original_strong_cohort_verified: strongCohort.filter(group => fullyVerified(group.ids)).length,
  original_core_groups_verified: cohortReview.filter(group => group.status === "verified_explicit_provider_crosswalk").length,
  original_core_groups_rejected_distinct_people: cohortReview.filter(group => group.status === "rejected_distinct_crosswalk_people").length,
  supplemental_pairs_verified: supplemental.filter(pair => fullyVerified(pair.ids)).length,
  verified_groups_outside_original_core: groups.filter(group => group.ids.every(id => !coreIds.has(id))).length,
  verified_profiles_outside_original_core: groups.flatMap(group => group.ids).filter(id => !coreIds.has(id)).length,
  canonical_missing_party_fills_verified: groups.filter(group => group.field_review.party.status === "verified_missing_field_fill").length,
  party_fill_links: links.filter(link => link.fields.party).length,
  canonical_party_fills_held: groups.filter(group => group.field_review.party.status === "held").length,
  approved_to_apply: 0, applied: 0,
};
const report = {
  schema_version: 1, generated_at: new Date().toISOString(),
  mode: "LOCAL REVIEW ONLY; no network access or production mutations",
  source_note: "United States project public Congress legislator crosswalk. Explicit provider IDs are identity evidence; this is not an approval to link records or replace fields.",
  input_files: Object.fromEntries(inputs.map(filename => [filename, { sha256: files[filename].sha256 }])),
  capture, summary, groups, links, held_groups: heldGroups, held_profiles: rowHolds, core_cohort_review: cohortReview,
};
await writeFile(resolve(directory, "reviewed-crosswalk-links.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
