/**
 * Preview: npx tsx scripts/apply-reviewed-politician-identities.ts --manifest=path.json
 * Apply only after release approval: add --apply --manifest-sha256=<operator-pinned
 * SHA256 of approved file bytes> --reviewed-by=<reviewer>. Every included link and
 * its evidence must explicitly set approved_to_apply:true. The generated review
 * file is deliberately unapproved. Retains a fresh local preflight snapshot.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database";
import { shouldApplyImport } from "../lib/civic/import-observation";

export type IdentityProfile = Record<string, unknown> & { id: string; updated_at: string };
type Counts = Record<string, number>;
type Registry = { namespace: string; external_id: string; canonical_id: string };
type AliasRow = Database["public"]["Tables"]["politician_aliases"]["Row"];
type Decision = { id: string; source_id: string; canonical_id: string; evidence: unknown; fields: unknown; reviewed_by: string; created_at: string; before_state: Json; dependency_counts: Json };
export type ReviewedLink = {
  decision_id: string; source_id: string; canonical_id: string; approved_to_apply: boolean;
  source_updated_at: string; canonical_updated_at: string;
  evidence: Record<string, unknown> & { approved_to_apply: boolean; source_urls: string[]; source_profile_sha256: string; canonical_profile_sha256: string };
  fields: { party?: string; aliases?: string[] };
};
export type IdentityManifest = { links: ReviewedLink[]; input_files: Record<string, { sha256: string }> };
export type CapturedRelationships = {
  byId: Record<string, Counts>;
  extra: { votes: Array<{ questions: { politician_id: string } }>; [key: string]: unknown };
};
type LinkRequest = Database["public"]["Functions"]["link_politician_identity"]["Args"];
export interface IdentityApplyStore {
  profiles(ids?: string[]): Promise<IdentityProfile[]>;
  registry(): Promise<Registry[]>;
  decisions(ids: string[]): Promise<Decision[]>;
  aliases(ids: string[]): Promise<AliasRow[]>;
  counts(ids: string[]): Promise<Counts>;
  hasVerificationSources(ids: string[]): Promise<boolean>;
  link(args: LinkRequest): Promise<unknown>;
}
export const hashBytes = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sortJson = (value: unknown): unknown => Array.isArray(value) ? value.map(sortJson)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sortJson(entry)])) : value;
const same = (left: unknown, right: unknown) => JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
const unique = (values: string[]) => [...new Set(values)].sort();
const providerIds = (row: IdentityProfile): Registry[] => [
  ["congress.bioguide", row.bioguide_id], ["openstates.person", row.openstates_id],
  ["govtrack.person", row.govtrack_id], ["votesmart.person", row.votesmart_id],
  ["fec.candidate", row.fec_id], ["fec.candidate", row.fec_candidate_id], ["fec.candidate", row.candidate_fec_id],
].filter((entry) => typeof entry[1] === "string" && entry[1].trim()).map(([namespace, value]) => ({ namespace: String(namespace), external_id: String(value), canonical_id: row.id }));

const optionalLedgers = [
  "politician_aliases", "politician_verification_sources", "politician_photo_history",
  "politician_account_audit", "race_candidates", "answer_media", "question_notification_events",
  "politician_notification_preferences", "politician_notification_consent_audit", "answer_corrections",
  "question_reports", "incumbent_races",
] as const;
const baseCountKeys = ["questions", "answers", "votes", "snapshots", "team", "verifications", "x_posts", "outreach"];
function validateCounts(counts: Counts) {
  if (baseCountKeys.some(key => !Object.hasOwn(counts, key)) ||
      Object.entries(counts).some(([key, value]) => ![...baseCountKeys, ...optionalLedgers].includes(key) || !Number.isInteger(value) || value < 0)) throw new Error("Unexpected or incomplete dependency RPC contract");
}

function capturedCounts(ids: string[], relationships: CapturedRelationships): Counts {
  const names: Record<string, string> = { questions: "questions", answers: "answers", snapshots: "weekly_snapshots", team: "politician_team", verifications: "politician_verifications", x_posts: "x_posts", outreach: "x_outreach_log" };
  const counts: Counts = {};
  for (const [key, field] of Object.entries(names)) {
    counts[key] = ids.reduce((total, id) => {
      const value = relationships.byId[id]?.[field];
      if (!Number.isInteger(value) || value! < 0) throw new Error(`Missing reviewed dependency count ${id}:${field}`);
      return total + value!;
    }, 0);
  }
  if (!Array.isArray(relationships.extra?.votes)) throw new Error("Reviewed vote capture is missing");
  counts.votes = relationships.extra.votes.filter(vote => ids.includes(vote.questions.politician_id)).length;
  for (const field of optionalLedgers) {
    const values = ids.map(id => relationships.byId[id]?.[field]);
    if (values.every(value => Number.isInteger(value) && value! >= 0)) counts[field] = values.reduce((sum, value) => sum! + value!, 0)!;
    else if (values.some(value => value !== undefined)) throw new Error(`Incomplete reviewed ledger count: ${field}`);
    else {
      const table = field === "incumbent_races" ? "races" : field;
      const extra = relationships.extra[table];
      if (Array.isArray(extra)) {
        const owner = field === "incumbent_races" ? "incumbent_id" : "politician_id";
        counts[field] = extra.filter(row => row && typeof row === "object" && ids.includes(String(row[owner]))).length;
      }
    }
  }
  return counts;
}

function validateCapturedCounts(current: Counts, captured: Counts, aliasCount: number) {
  validateCounts(current);
  for (const [key, value] of Object.entries(captured)) {
    const expected = key === "politician_aliases" ? aliasCount : value;
    if (current[key] !== expected) throw new Error(`Dependency drift requires review: ${key}`);
  }
  if (current.politician_aliases !== aliasCount) throw new Error("Alias ledger count does not match fetched rows");
}

const aliasKey = (row: Pick<AliasRow, "politician_id" | "alias">) => `${row.politician_id}\u0000${row.alias}`;
type ExpectedAlias = Pick<AliasRow, "politician_id" | "alias" | "alias_type"> & Partial<Pick<AliasRow, "id" | "created_at">>;
function copyAliases(rows: ExpectedAlias[], source: string, target: string, names: string[]): ExpectedAlias[] {
  const result = [...rows];
  const keys = new Set(result.map(aliasKey));
  for (const row of rows.filter(row => row.politician_id === source)) {
    const copy = { politician_id: target, alias: row.alias, alias_type: row.alias_type };
    if (!keys.has(aliasKey(copy))) { result.push(copy); keys.add(aliasKey(copy)); }
  }
  for (const alias of names.filter(alias => alias.trim())) {
    const copy: ExpectedAlias = { politician_id: target, alias, alias_type: "nickname" };
    if (!keys.has(aliasKey(copy))) { result.push(copy); keys.add(aliasKey(copy)); }
  }
  return result;
}
function validateAliasRows(actual: AliasRow[], expected: ExpectedAlias[]) {
  const byKey = new Map(actual.map(row => [aliasKey(row), row]));
  if (byKey.size !== actual.length || actual.length !== expected.length) throw new Error("Unexpected alias ledger growth or removal");
  for (const row of expected) {
    const found = byKey.get(aliasKey(row));
    if (!found || found.alias_type !== row.alias_type || (row.id && found.id !== row.id) || (row.created_at && found.created_at !== row.created_at)) throw new Error("Alias ledger changed outside the reviewed copy operation");
  }
}

function validateProfile(live: IdentityProfile, original: IdentityProfile, completed: ReviewedLink[]) {
  if (live.is_test !== false || live.is_active !== true || live.verification_tier !== "0") throw new Error(`Authority/activity changed: ${live.id}`);
  const sourceLink = completed.find(link => link.source_id === live.id);
  const targetLinks = completed.filter(link => link.canonical_id === live.id);
  if ((live.canonical_politician_id ?? null) !== (sourceLink?.canonical_id ?? null)) throw new Error(`Unexpected identity membership: ${live.id}`);
  for (const [key, reviewed] of Object.entries(original)) {
    if (key === "canonical_politician_id") continue;
    if (key === "updated_at" && (sourceLink || targetLinks.length)) continue;
    if (key === "aliases" && targetLinks.length) continue;
    if (key === "party" && targetLinks.some(link => link.fields.party)) continue;
    if (!same(live[key], reviewed)) throw new Error(`Reviewed profile drift: ${live.id}:${key}`);
  }
  return { sourceLink, targetLinks };
}

export async function runIdentityApplication(options: {
  manifest: IdentityManifest; originals: IdentityProfile[]; relationships: CapturedRelationships;
  store: IdentityApplyStore; apply: boolean; manifestSha256: string; pinnedSha256?: string;
  reviewedBy: string; snapshot: (value: unknown) => Promise<void>; onProgress?: (message: string) => void;
}) {
  const { manifest, originals, relationships, store, apply, reviewedBy } = options;
  if (!Array.isArray(manifest.links) || !manifest.links.length) throw new Error("Manifest has no reviewed links");
  if (apply && (options.pinnedSha256 !== options.manifestSha256 || !/^[a-f0-9]{64}$/.test(options.pinnedSha256))) throw new Error("--apply requires an operator-pinned manifest SHA256 matching the approved file");
  if (apply && reviewedBy.trim().length < 2) throw new Error("--apply requires --reviewed-by");
  const sourceIds = new Set<string>(), decisionIds = new Set<string>();
  const originalById = new Map(originals.map(row => [row.id, row]));
  const groups = new Map<string, Set<string>>();
  const evidenceFor = (link: ReviewedLink) => ({ ...link.evidence, approved_manifest_sha256: options.manifestSha256 });
  const copiedNames = (link: ReviewedLink) => {
    const source = originalById.get(link.source_id)!;
    return [...((source.aliases ?? []) as string[]), String(source.full_name), ...(link.fields.aliases ?? [])];
  };
  for (const link of manifest.links) {
    if (![link.decision_id, link.source_id, link.canonical_id].every(id => uuid.test(id)) || link.source_id === link.canonical_id || sourceIds.has(link.source_id) || decisionIds.has(link.decision_id)) throw new Error("Invalid or repeated decision/source identity");
    sourceIds.add(link.source_id); decisionIds.add(link.decision_id);
    if (apply && (link.approved_to_apply !== true || link.evidence.approved_to_apply !== true)) throw new Error(`Link is not explicitly approved: ${link.source_id}`);
    if (!Array.isArray(link.evidence.source_urls) || !link.evidence.source_urls.length || !link.evidence.source_urls.every(url => /^https:\/\//.test(url))) throw new Error("Reviewed source URLs required");
    if (!link.fields || Object.keys(link.fields).some(field => !["party", "aliases"].includes(field))) throw new Error("Unsupported profile edits in identity manifest");
    for (const [id, hash] of [[link.source_id, link.evidence.source_profile_sha256], [link.canonical_id, link.evidence.canonical_profile_sha256]]) {
      const row = originalById.get(id!);
      if (!row || hashBytes(JSON.stringify(row)) !== hash) throw new Error(`Original reviewed profile fingerprint mismatch: ${id}`);
    }
    if (link.source_updated_at !== originalById.get(link.source_id)!.updated_at || link.canonical_updated_at !== originalById.get(link.canonical_id)!.updated_at) throw new Error("Reviewed timestamps do not match the captured profiles");
    if (link.fields.party !== undefined && (typeof link.fields.party !== "string" || !link.fields.party.trim() ||
        (originalById.get(link.canonical_id)!.party && originalById.get(link.canonical_id)!.party !== link.fields.party))) throw new Error("Party selection would replace existing profile information");
    if (link.fields.aliases !== undefined && (!Array.isArray(link.fields.aliases) || link.fields.aliases.length > 200 || link.fields.aliases.some(value => typeof value !== "string" || !value.trim() || value.length > 200))) throw new Error("Invalid reviewed aliases");
    const ids = groups.get(link.canonical_id) ?? new Set([link.canonical_id]);
    ids.add(link.source_id); groups.set(link.canonical_id, ids);
  }
  if ([...groups.keys()].some(id => sourceIds.has(id))) throw new Error("Chained identity instructions are not allowed");
  const completed: ReviewedLink[] = [];
  const decisions = (await store.decisions([...decisionIds])).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const decision of decisions) {
    const link = manifest.links.find(row => row.decision_id === decision.id);
    if (!link || decision.source_id !== link.source_id || decision.canonical_id !== link.canonical_id || !same(decision.fields, link.fields) || !same(decision.evidence, evidenceFor(link))) throw new Error(`Previously applied decision differs: ${decision.id}`);
    completed.push(link);
  }
  let profiles = await store.profiles();
  const registry = await store.registry();
  const verifyProfiles = (fresh: IdentityProfile[], selectedRoot?: string) => {
    const byId = new Map(fresh.map(row => [row.id, row]));
    if (byId.size !== fresh.length) throw new Error("Profile refresh returned duplicate IDs");
    const providerIndex = new Map<string, Set<string>>();
    if (!selectedRoot) {
      for (const row of fresh) {
        for (const provider of providerIds(row)) {
          const key = `${provider.namespace}:${provider.external_id}`;
          const owners = providerIndex.get(key) ?? new Set<string>();
          owners.add(row.id); providerIndex.set(key, owners);
        }
      }
    }
    for (const [root, ids] of groups) {
      if (selectedRoot && selectedRoot !== root) continue;
      const externalMembers = fresh.filter(row => row.canonical_politician_id === root && !ids.has(row.id));
      if (externalMembers.length) throw new Error(`Unreviewed identity members for ${root}`);
      for (const id of ids) {
        const row = byId.get(id), original = originalById.get(id);
        if (!row || !original) throw new Error(`Profile disappeared: ${id}`);
        const { targetLinks } = validateProfile(row, original, completed);
        if (targetLinks.length) {
          const aliases = unique([
            ...((original.aliases ?? []) as string[]),
            ...targetLinks.flatMap(link => {
              const source = originalById.get(link.source_id)!;
              return [...((source.aliases ?? []) as string[]), String(source.full_name), ...(link.fields.aliases ?? [])];
            }),
          ].filter(alias => alias.trim()));
          if (!same(unique((row.aliases ?? []) as string[]), aliases)) throw new Error(`Unexpected alias changes: ${id}`);
          const selectedParties = unique(targetLinks.map(link => link.fields.party).filter((party): party is string => Boolean(party)));
          if (selectedParties.length > 1 || (selectedParties.length && row.party !== selectedParties[0])) throw new Error(`Unexpected party selection: ${id}`);
        }
      }
      const rawProviders = [...ids].flatMap(id => providerIds(byId.get(id)!));
      for (const provider of rawProviders) {
        if ([...(providerIndex.get(`${provider.namespace}:${provider.external_id}`) ?? [])].some(id => !ids.has(id))) throw new Error(`Provider identity exists outside reviewed group: ${provider.namespace}:${provider.external_id}`);
        if (registry.some(row => row.namespace === provider.namespace && row.external_id === provider.external_id && !ids.has(row.canonical_id))) throw new Error(`Provider registry ownership conflict: ${provider.external_id}`);
      }
      for (const namespace of ["congress.bioguide", "openstates.person", "govtrack.person", "votesmart.person"]) {
        if (new Set([...rawProviders, ...registry.filter(row => ids.has(row.canonical_id))].filter(row => row.namespace === namespace).map(row => row.external_id)).size > 1) throw new Error(`Conflicting provider identities in ${root}:${namespace}`);
      }
    }
    return byId;
  };
  verifyProfiles(profiles);
  const freshCounts: Record<string, Counts> = {};
  const expectedAliases = new Map<string, ExpectedAlias[]>();
  for (const [root, ids] of groups) {
    const members = [...ids].sort();
    const expected = capturedCounts(members, relationships);
    const aliasRows = await store.aliases(members);
    let baselineAliases: ExpectedAlias[] = [...aliasRows];
    const previous = decisions.filter(decision => decision.canonical_id === root);
    for (const id of members) {
      const before = previous.find(decision => id === root || decision.source_id === id);
      if (!before) continue;
      const state = before.before_state as { aliases?: AliasRow[] } | null;
      if (!Array.isArray(state?.aliases)) throw new Error(`Completed decision is missing transactional alias evidence: ${before.id}`);
      const savedRows = state.aliases.filter(row => row.politician_id === id);
      baselineAliases = [...baselineAliases.filter(row => row.politician_id !== id), ...savedRows];
    }
    if (expected.politician_aliases !== undefined && baselineAliases.length !== expected.politician_aliases) throw new Error(`Original alias ledger drift requires review: ${root}`);
    for (const id of members) {
      const capturedAliasCount = relationships.byId[id]?.politician_aliases;
      if (capturedAliasCount !== undefined && baselineAliases.filter(row => row.politician_id === id).length !== capturedAliasCount) throw new Error(`Original profile alias count drift: ${id}`);
    }
    let simulatedAliases = baselineAliases;
    for (const decision of previous) simulatedAliases = copyAliases(simulatedAliases, decision.source_id, root, copiedNames(manifest.links.find(link => link.decision_id === decision.id)!));
    validateAliasRows(aliasRows, simulatedAliases);
    // Once generated rows are observed, preserve their exact IDs and metadata
    // through every remaining step of this run.
    expectedAliases.set(root, aliasRows);
    if (previous.length) {
      const latest = previous[previous.length - 1]!;
      const before = latest.before_state as { aliases?: AliasRow[] };
      const priorCounts = latest.dependency_counts as Counts;
      validateCounts(priorCounts);
      const beforeAliases = before.aliases;
      if (!Array.isArray(beforeAliases)) throw new Error("Replay alias evidence unavailable");
      const completedMembers = unique([root, ...previous.map(decision => decision.source_id)]);
      const replayCounts = {
        ...priorCounts,
        politician_aliases: copyAliases(beforeAliases, latest.source_id, root, copiedNames(manifest.links.find(link => link.decision_id === latest.id)!)).length,
      };
      if (!same(await store.counts(completedMembers), replayCounts)) throw new Error(`Completed decision ledger drift requires review: ${root}`);
    }
    const current = await store.counts(members);
    validateCapturedCounts(current, expected, aliasRows.length);
    if (current.team || current.verifications || current.answers || await store.hasVerificationSources(members)) throw new Error(`Fresh authority evidence requires review: ${root}`);
    freshCounts[root] = current;
  }
  await options.snapshot({
    captured_at: new Date().toISOString(), mode: apply ? "apply_preflight" : "dry_run",
    approved_manifest_sha256: options.manifestSha256, profiles: profiles.filter(row => [...groups.values()].some(ids => ids.has(row.id))),
    registry, dependency_counts: freshCounts, alias_rows: Object.fromEntries(expectedAliases), completed_decisions: decisions,
  });
  if (!apply) return { planned: manifest.links.length, alreadyApplied: completed.length, applied: 0, dryRun: true };
  let applied = 0;
  for (const link of manifest.links) {
    if (completed.some(row => row.decision_id === link.decision_id)) continue;
    // Recheck public metadata and full group dependency totals immediately before
    // each transaction. Only prior decisions from this pinned manifest may differ.
    const allMembers = [...groups.get(link.canonical_id)!].sort();
    profiles = await store.profiles(allMembers);
    const fresh = verifyProfiles(profiles, link.canonical_id);
    const current = await store.counts(allMembers);
    const aliases = await store.aliases(allMembers);
    validateAliasRows(aliases, expectedAliases.get(link.canonical_id)!);
    const expectedFullCounts = { ...freshCounts[link.canonical_id]!, politician_aliases: aliases.length };
    if (!same(current, expectedFullCounts) || await store.hasVerificationSources(allMembers)) throw new Error(`Dependency/authority drift before link: ${link.source_id}`);
    const resultingMembers = unique([link.source_id, link.canonical_id, ...completed.filter(row => row.canonical_id === link.canonical_id).map(row => row.source_id)]);
    const completeResultCounts = await store.counts(resultingMembers);
    validateCapturedCounts(completeResultCounts, capturedCounts(resultingMembers, relationships), aliases.filter(row => resultingMembers.includes(row.politician_id)).length);
    if (!same(Object.keys(completeResultCounts).sort(), Object.keys(current).sort())) throw new Error("Dependency schema changed during identity application");
    const afterAliases = copyAliases(aliases, link.source_id, link.canonical_id, copiedNames(link));
    await store.link({
      p_source_id: link.source_id, p_canonical_id: link.canonical_id,
      p_source_updated_at: fresh.get(link.source_id)!.updated_at, p_canonical_updated_at: fresh.get(link.canonical_id)!.updated_at,
      p_expected_counts: completeResultCounts, p_decision_id: link.decision_id,
      p_reviewed_by: reviewedBy.trim(), p_evidence: evidenceFor(link) as Json, p_fields: link.fields as Json,
    });
    completed.push(link); applied++;
    verifyProfiles(await store.profiles(allMembers), link.canonical_id);
    const actualAliases = await store.aliases(allMembers);
    validateAliasRows(actualAliases, afterAliases);
    expectedAliases.set(link.canonical_id, actualAliases);
    if (!same(await store.counts(allMembers), { ...freshCounts[link.canonical_id]!, politician_aliases: afterAliases.length })) throw new Error(`Post-link preservation count changed: ${link.source_id}`);
    options.onProgress?.(`Linked ${link.source_id} to ${link.canonical_id} (${applied})`);
  }
  return { planned: manifest.links.length, alreadyApplied: decisions.length, applied, dryRun: false };
}

export function supabaseIdentityStore(client: SupabaseClient<Database>): IdentityApplyStore {
  return {
    async profiles(ids) {
      const rows: IdentityProfile[] = [];
      for (let start = 0; ; start += 1000) {
        let query = client.from("politicians").select("*").order("id").range(start, start + 999);
        if (ids) {
          if (ids.length > 200 || ids.some(id => !uuid.test(id))) throw new Error("Invalid identity group refresh");
          // Include newly added children, so concurrent membership is a visible
          // drift instead of being silently omitted by a fixed .in(id) lookup.
          query = query.or(`id.in.(${ids.join(",")}),canonical_politician_id.in.(${ids.join(",")})`);
        }
        const { data, error } = await query;
        if (error) throw new Error(`Profile refresh failed: ${error.message}`);
        rows.push(...(data ?? []) as IdentityProfile[]);
        if ((data?.length ?? 0) < 1000) return rows;
      }
    },
    async registry() {
      const rows: Registry[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await client.from("politician_external_identifiers").select("namespace,external_id,canonical_id").order("namespace").order("external_id").range(start, start + 999);
        if (error) throw new Error(`Registry refresh failed: ${error.message}`);
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) return rows;
      }
    },
    async decisions(ids) {
      const rows: Decision[] = [];
      for (let start = 0; start < ids.length; start += 200) {
        const { data, error } = await client.from("politician_identity_decisions").select("id,source_id,canonical_id,evidence,fields,reviewed_by,created_at,before_state,dependency_counts").in("id", ids.slice(start, start + 200)).order("id");
        if (error) throw new Error(`Decision lookup failed: ${error.message}`);
        rows.push(...(data ?? []));
      }
      return rows;
    },
    async aliases(ids) {
      const rows: AliasRow[] = [];
      for (let batch = 0; batch < ids.length; batch += 200) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await client.from("politician_aliases").select("*").in("politician_id", ids.slice(batch, batch + 200)).order("id").range(offset, offset + 999);
          if (error) throw new Error(`Alias ledger refresh failed: ${error.message}`);
          rows.push(...(data ?? []));
          if ((data?.length ?? 0) < 1000) break;
        }
      }
      return rows;
    },
    async counts(ids) {
      const { data, error } = await client.rpc("politician_identity_dependency_counts", { p_ids: ids });
      if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Fresh dependency count failed");
      const counts = data as Counts;
      if (Object.values(counts).some(value => !Number.isInteger(value) || value < 0)) throw new Error("Invalid dependency counts");
      return counts;
    },
    async hasVerificationSources(ids) {
      for (let start = 0; start < ids.length; start += 200) {
        const { data, error } = await client.from("politician_verification_sources").select("politician_id").in("politician_id", ids.slice(start, start + 200)).limit(1);
        if (error) throw new Error(`Authority refresh failed: ${error.message}`);
        if (data?.length) return true;
      }
      return false;
    },
    async link(args) {
      const { data, error } = await client.rpc("link_politician_identity", args);
      if (error) throw new Error(`Identity link failed: ${error.message}`);
      return data;
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const apply = shouldApplyImport(args);
  const manifestPath = resolve(option("manifest") ?? "outputs/politician-identity-audit-20261122/reviewed-crosswalk-links.json");
  const text = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(text) as IdentityManifest;
  const input = (name: string) => {
    const raw = readFileSync(resolve(dirname(manifestPath), name), "utf8");
    if (hashBytes(raw) !== manifest.input_files[name]?.sha256) throw new Error(`Pinned input file changed: ${name}`);
    return JSON.parse(raw);
  };
  const originals = input("politicians.json") as IdentityProfile[];
  const relationships = input("relationships.json") as CapturedRelationships;
  for (const filename of Object.keys(manifest.input_files)) input(filename);
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local", override: true });
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const snapshotDirectory = resolve(option("snapshot-dir") ?? resolve(dirname(manifestPath), "apply-snapshots"));
  const result = await runIdentityApplication({
    manifest, originals, relationships, store: supabaseIdentityStore(client), apply,
    manifestSha256: hashBytes(text), pinnedSha256: option("manifest-sha256"), reviewedBy: option("reviewed-by") ?? "",
    snapshot: async value => {
      mkdirSync(snapshotDirectory, { recursive: true });
      const path = resolve(snapshotDirectory, `${new Date().toISOString().replace(/[:.]/g, "-")}-${hashBytes(text).slice(0, 12)}.json`);
      writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log(`Preservation snapshot: ${path}`);
    },
    onProgress: message => console.log(message),
  });
  console.log(JSON.stringify(result, null, 2));
  if (apply && result.applied) console.log("Required release step: call the approved site's POST /api/admin/identities/revalidate with ADMIN_SECRET before verifying public profiles.");
}

if (process.argv[1]?.endsWith("apply-reviewed-politician-identities.ts")) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
