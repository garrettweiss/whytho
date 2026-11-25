import type { Json } from "../../types/database";
import { readPoliticianIdentity, type IdentityClient } from "./client";
import { normalizeIdentityDistrict, normalizeIdentityState } from "./normalize";

export type IdentityNamespace = "congress.bioguide" | "openstates.person" | "fec.candidate" | "reviewed.governor";
export type IdentityImportRecord = {
  full_name: string; state: string; office: string | null; district?: string | null;
  party?: string | null; bio?: string | null; website_url?: string | null; aliases?: string[];
  is_candidate?: boolean; candidate_election_year?: number | null; candidate_office?: string | null;
  incumbent_challenge?: string | null; candidate_status?: string | null; election_date?: string | null;
  race_id?: string | null; bioguide_id?: string | null;
  photo_url?: string | null; photo_source_url?: string | null; photo_credit?: string | null; photo_rights_basis?: string | null;
};
export type IdentityObservation = { namespace: IdentityNamespace; externalId: string; record: IdentityImportRecord; sourceUrl?: string | null };
export type IdentityImportResult = {
  status: "matched" | "created" | "would_create" | "review_required";
  canonicalId: string | null; canonicalSlug: string | null; memberIds: string[];
  candidateIds: string[]; reason: string | null; applied: boolean;
  photoStatus: "review_required" | "preserved" | "not_provided";
};

export async function importPoliticianIdentity(client: IdentityClient, observation: IdentityObservation, options: { apply?: boolean } = {}): Promise<IdentityImportResult> {
  const { record } = observation;
  const normalized = { ...record, full_name: record.full_name.trim().replace(/\s+/g, " "),
    state: normalizeIdentityState(record.state), district: normalizeIdentityDistrict(record.district) };
  if (!normalized.full_name || normalized.full_name.length > 200 || !observation.externalId.trim()) throw new Error("Invalid identity observation");
  const { data, error } = await client.rpc("ingest_politician_identity", {
    p_namespace: observation.namespace, p_external_id: observation.externalId.trim(),
    p_record: normalized as Json, p_source_url: observation.sourceUrl ?? null, p_apply: options.apply === true,
  }).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error("Politician import failed; no absence was inferred", { cause: error });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid politician import result");
  const result = data as Record<string, Json | undefined>;
  if (!["matched", "created", "would_create", "review_required"].includes(String(result.status)) ||
      typeof result.applied !== "boolean" || !["review_required", "preserved", "not_provided"].includes(String(result.photo_status)) || !Array.isArray(result.member_ids) || !Array.isArray(result.candidate_ids)) {
    throw new Error("Invalid politician import result");
  }
  const resolved = result.status === "matched" || result.status === "created";
  const identity = resolved ? readPoliticianIdentity(result) : null;
  if ((resolved && !identity) || (!resolved && (result.canonical_id !== null || result.canonical_slug !== null || result.member_ids.length !== 0 || result.applied)) ||
      (result.status === "created" && !result.applied) ||
      !result.candidate_ids.every(id => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
      (result.reason !== null && typeof result.reason !== "string")) {
    throw new Error("Invalid politician import result");
  }
  return {
    status: result.status as IdentityImportResult["status"], canonicalId: identity?.canonicalId ?? null,
    canonicalSlug: identity?.canonicalSlug ?? null, memberIds: identity?.memberIds ?? [],
    candidateIds: result.candidate_ids as string[], reason: result.reason as string | null, applied: result.applied,
    photoStatus: result.photo_status as IdentityImportResult["photoStatus"],
  };
}
