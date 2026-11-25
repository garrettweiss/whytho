/** Build a LOCAL review manifest. Suggestions are not production merge approvals. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve(process.argv[2] || "outputs/politician-identity-audit-20261122");
const read = async file => JSON.parse(await readFile(resolve(output, file), "utf8"));
const [rows, groups, relationships] = await Promise.all([read("politicians.json"), read("candidate-groups.json"), read("relationships.json")]);
const byId = Object.fromEntries(rows.map(row => [row.id, row]));
const snapshots = relationships.extra.weekly_snapshots;
if (!snapshots || !relationships.extra.votes) throw new Error("Preservation references unavailable");
const protectedFields = ["photo_url", "photo_source_url", "photo_credit", "photo_rights_basis", "bio", "party", "website_url", "social_handles", "aliases", "bioguide_id", "openstates_id", "candidate_fec_id"];
const populated = value => value != null && value !== "" && (typeof value !== "object" || Object.keys(value).length > 0);
function score(row) {
  const c = relationships.byId[row.id];
  return [Number(row.verification_tier), +(c.politician_team > 0), +(c.official_answers > 0), +((c.user_questions || 0) + (c.votes || 0) > 0), +Boolean(row.bioguide_id), +Boolean(row.openstates_id && !row.is_candidate), +(c.questions > 0), +(c.weekly_snapshots > 0), +Boolean(row.photo_url), protectedFields.filter(field => populated(row[field])).length];
}
function compare(left, right) {
  const a = score(left), b = score(right);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}
const namesakeDecision = {
  group_id: "identity-9e0e7c3a", decision: "keep_separate_people",
  reason: "Louisiana State Representative Michael T. Johnson (state district 27) and U.S. Representative Mike Johnson (LA-04) are different people. Exact display name/state is not identity proof.",
  sources: ["https://house.louisiana.gov/H_Reps/members?ID=27", "https://clerk.house.gov/members/J000299"],
  checked_date: "2026-11-22",
};
const manifest = groups.map(group => {
  const members = group.ids.map(id => byId[id]).sort(compare);
  const anchor = members[0];
  const memberCounts = group.ids.map(id => relationships.byId[id]);
  const sums = Object.fromEntries([...new Set(memberCounts.flatMap(Object.keys))].map(field => [field, memberCounts.reduce((n, c) => n + (c[field] || 0), 0)]));
  const weekCounts = {};
  for (const snapshot of snapshots.filter(row => group.ids.includes(row.politician_id))) weekCounts[snapshot.week_number] = (weekCounts[snapshot.week_number] || 0) + 1;
  const snapshotOverlapWeeks = Object.keys(weekCounts).filter(week => weekCounts[week] > 1);
  const rejected = group.group_id === namesakeDecision.group_id;
  const risks = ["Identity and field provenance must be reviewed before any link is applied."];
  if (group.tier !== "strong_cross_source_candidate") risks.push("Name/seat similarity is insufficient to approve consolidation.");
  if (snapshotOverlapWeeks.length) risks.push("Overlapping historical snapshot periods: retain originals; do not sum stored percentages.");
  if (memberCounts.filter(count => count.questions > 0).length > 1) risks.push("Questions exist on multiple source records: preserve each question ID and vote record.");
  if (sums.x_posts || sums.x_outreach_log) risks.push("X attribution and historical outreach suppression must resolve all approved source IDs.");
  if (sums.politician_team || members.some(row => Number(row.verification_tier) > 0)) risks.push("Ownership requires separate review; identity linking does not grant team access or verification.");
  const proposedFieldDonors = {};
  for (const field of protectedFields) {
    if (!populated(anchor[field])) {
      const donors = members.slice(1).filter(row => populated(row[field]));
      if (donors.length) proposedFieldDonors[field] = donors.map(row => ({ id: row.id, slug: row.slug, value: row[field], instruction: "Validate provenance and temporal meaning; never blindly overwrite canonical values." }));
    }
  }
  return {
    ...group, status: rejected ? "rejected_namesake_match" : "pending_identity_review",
    approved_to_apply: false,
    suggested_anchor_if_identity_confirmed: rejected ? null : { id: anchor.id, slug: anchor.slug, rationale: "Provisional ranking: claim/authority, genuine participation, official identifier, established content, useful fields, then oldest URL. Preserve data from every source separately." },
    related_totals: sums, snapshot_overlap_weeks: snapshotOverlapWeeks, risks,
    proposed_field_donors: rejected ? {} : proposedFieldDonors,
    profiles: members.map(row => ({ id: row.id, slug: row.slug, name: row.full_name, office: row.office, state: row.state, district: row.district, created_at: row.created_at, updated_at: row.updated_at, verification_tier: row.verification_tier, candidate_election_year: row.candidate_election_year, is_candidate: row.is_candidate, fields_present: protectedFields.filter(field => populated(row[field])), relationships: relationships.byId[row.id] })),
  };
});
const summary = {
  status: "Planning only. No approved or applied identity links.",
  reviewed_false_positive: namesakeDecision,
  core_flagged_groups: groups.length,
  remaining_groups_after_known_namesake_rejection: manifest.filter(group => group.status !== "rejected_namesake_match").length,
  questions: manifest.reduce((n, g) => n + g.related_totals.questions, 0),
  weekly_snapshots: manifest.reduce((n, g) => n + g.related_totals.weekly_snapshots, 0),
  x_posts: manifest.reduce((n, g) => n + g.related_totals.x_posts, 0),
  x_outreach_log: manifest.reduce((n, g) => n + g.related_totals.x_outreach_log, 0),
  groups_with_questions_on_multiple_rows: manifest.filter(group => group.profiles.filter(row => row.relationships.questions > 0).length > 1).length,
  groups_with_snapshot_week_overlap: manifest.filter(group => group.snapshot_overlap_weeks.length).length,
};
await writeFile(resolve(output, "review-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(resolve(output, "preservation-summary.json"), JSON.stringify(summary, null, 2) + "\n");
const fields = ["group_id", "tier", "status", "suggested_anchor_slug", "profile_slugs", "questions", "snapshots", "x_posts", "outreach_logs", "overlapping_snapshot_weeks", "missing_fields_with_donors"];
const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [fields, ...manifest.map(group => [group.group_id, group.tier, group.status, group.suggested_anchor_if_identity_confirmed?.slug, group.profiles.map(row => row.slug).join(" | "), group.related_totals.questions, group.related_totals.weekly_snapshots, group.related_totals.x_posts, group.related_totals.x_outreach_log, group.snapshot_overlap_weeks.join(" | "), Object.keys(group.proposed_field_donors).join(" | ")])].map(row => row.map(quote).join(",")).join("\n") + "\n";
await writeFile(resolve(output, "review-manifest.csv"), csv);
console.log(JSON.stringify(summary, null, 2));
