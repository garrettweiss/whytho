/**
 * Build a photo rights manifest for current members of Congress from authoritative federal sources.
 * Read-only: queries the database, the Congress.gov API and the Biographical Directory photo server.
 * Writes manifest + report JSON under docs/launch/evidence/photos/ (the editorial audit record).
 *
 *   npx tsx scripts/build-federal-photo-manifest.ts                         # federal works only
 *   npx tsx scripts/build-federal-photo-manifest.ts --include-held          # also member-supplied and GPO Pictorial Directory portraits
 * Sources, in order: bioguide.congress.gov full-size photo; if that is below 400x500, the unitedstates/images
 * copy of the GPO Pictorial Directory portrait (held class, since GPO publication is not a federal-work basis).
 *   npx tsx scripts/build-federal-photo-manifest.ts --limit=20 --concurrency=3
 *
 * Then: npx tsx scripts/photo-pipeline.ts --rights-manifest=<manifest> --dry-run
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../types/database";
import { photoRightsManifest, type PhotoRights } from "../lib/photos/rights";
import { downloadApprovedPhoto } from "../lib/photos/download";
import { PORTRAIT_MIN_HEIGHT, PORTRAIT_MIN_WIDTH } from "../lib/photos/policy";
import { BIOGUIDE_PAGE, BIOGUIDE_PHOTO, UNITEDSTATES_IMAGE, UNITEDSTATES_IMAGES_PAGE, US_GOV_COPYRIGHT, classifyCongressAttribution, surnameMatches } from "../lib/photos/manifest-sources";
try { process.loadEnvFile(".env.local"); } catch { /* environment may be injected */ }

const args = process.argv.slice(2);
const flag = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
const LIMIT = Number(flag("limit") ?? Infinity);
const CONCURRENCY = Math.min(4, Math.max(1, Number(flag("concurrency") ?? 3)));
const INCLUDE_HELD = args.includes("--include-held") || args.includes("--include-member-supplied");
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUT_DIR = flag("out") ?? "docs/launch/evidence/photos";
const REVIEWER = "scripts/build-federal-photo-manifest.ts (Congress.gov API attribution + Biographical Directory photo, automated check)";
const API_KEY = process.env.CONGRESS_API_KEY;
if (!API_KEY) throw new Error("CONGRESS_API_KEY is required");

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
type Person = { id: string; slug: string; full_name: string; bioguide_id: string | null; photo_url: string | null; photo_source_url: string | null };
type ApiMember = { bioguideId: string; name: string; depiction?: { imageUrl?: string; attribution?: string }; terms?: unknown };

async function people(): Promise<Person[]> {
  const rows: Person[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("politicians").select("id,slug,full_name,bioguide_id,photo_url,photo_source_url")
      .eq("is_active", true).eq("is_test", false).not("bioguide_id", "is", null).order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Person[])); if (data.length < 1000) return rows;
  }
}
async function currentMembers(): Promise<Map<string, ApiMember>> {
  const map = new Map<string, ApiMember>();
  let url: string | undefined = `https://api.congress.gov/v3/member?currentMember=true&limit=250&format=json`;
  while (url) {
    const res = await fetch(`${url}&api_key=${API_KEY}`, { headers: { "User-Agent": "WhyThoPhotoImport/1.0 (+https://whytho.us)" } });
    if (!res.ok) throw new Error(`Congress.gov API ${res.status}`);
    const body = await res.json() as { members: ApiMember[]; pagination?: { next?: string } };
    for (const m of body.members) map.set(m.bioguideId.toUpperCase(), m);
    url = body.pagination?.next;
  }
  return map;
}

type Row = { politician_id: string; slug: string; bioguide_id: string; status: string; attribution?: string; kind?: string; source?: string; width?: number; height?: number; bytes?: number; detail?: string };
async function main() {
  const [rows, members] = await Promise.all([people(), currentMembers()]);
  console.log(JSON.stringify({ profiles_with_bioguide: rows.length, current_members_in_api: members.size }));
  const selected = rows.slice(0, LIMIT);
  const report: Row[] = []; const manifest: PhotoRights[] = []; const memberSupplied: PhotoRights[] = [];
  const checkedAt = new Date().toISOString();
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const p = selected[cursor++]!; const bioguide = p.bioguide_id!.toUpperCase();
      const row: Row = { politician_id: p.id, slug: p.slug, bioguide_id: bioguide, status: "pending" };
      report.push(row);
      const member = members.get(bioguide);
      if (!member) { row.status = "not_a_current_member"; continue; }
      if (!surnameMatches(p.full_name, member.name)) { row.status = "identity_mismatch"; row.detail = member.name; continue; }
      const attribution = classifyCongressAttribution(member.depiction?.attribution);
      row.attribution = attribution.text; row.kind = attribution.kind;
      if (attribution.kind === "unresolved") { row.status = "attribution_unresolved"; continue; }
      type Source = { url: string; page: string; kind: "bioguide" | "unitedstates" };
      const sources: Source[] = [{ url: BIOGUIDE_PHOTO(bioguide), page: BIOGUIDE_PAGE(bioguide), kind: "bioguide" }];
      // The GPO copy is only a fallback for the held classes; a federal-work claim must stay tied to the attributed photo.
      if (attribution.kind !== "federal_official") sources.push({ url: UNITEDSTATES_IMAGE(bioguide), page: UNITEDSTATES_IMAGES_PAGE, kind: "unitedstates" });
      if (sources.some(s => p.photo_source_url === s.url) && p.photo_url?.includes("/politician-photos/")) { row.status = "already_current"; continue; }
      let chosen: Source | null = null; const failures: string[] = [];
      for (const source of sources) {
        try {
          const bytes = await downloadApprovedPhoto(source.url);
          const meta = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
          const width = meta.autoOrient?.width ?? meta.width ?? 0, height = meta.autoOrient?.height ?? meta.height ?? 0;
          if (source.kind === "bioguide" || !row.width) Object.assign(row, { width, height, bytes: bytes.length });
          if (width < PORTRAIT_MIN_WIDTH || height < PORTRAIT_MIN_HEIGHT) { failures.push(`${source.kind} ${width}x${height}`); continue; }
          Object.assign(row, { width, height, bytes: bytes.length }); chosen = source; break;
        } catch (error) { failures.push(`${source.kind}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (!chosen) { row.status = failures.every(f => /\d+x\d+$/.test(f)) ? "source_too_small" : "download_failed"; row.detail = failures.join("; "); continue; }
      row.source = chosen.kind;
      const federal = attribution.kind === "federal_official";
      const license = federal ? "US-federal-official-duty" : chosen.kind === "unitedstates" ? "gpo-pictorial-directory" : attribution.kind === "gpo_publication" ? "gpo-pictorial-directory" : "congress-member-supplied";
      const entry: PhotoRights = {
        politician_id: p.id, source_url: chosen.url, source_page: chosen.page,
        creator: chosen.kind === "unitedstates" ? `${attribution.text} (GPO Congressional Pictorial Directory copy)` : attribution.text,
        license,
        license_url: federal ? US_GOV_COPYRIGHT : chosen.page,
        evidence: federal
          ? `Congress.gov API member record for ${bioguide} (checked ${checkedAt}) lists depiction.attribution "${attribution.text}", an official photograph produced by Senate or House staff. Works of United States government employees in the course of official duties are not subject to US copyright (${US_GOV_COPYRIGHT}). Photo served by the Biographical Directory of the U.S. Congress at ${chosen.url} (${row.width}x${row.height}).`
          : `Congress.gov API member record for ${bioguide} (checked ${checkedAt}) lists depiction.attribution "${attribution.text}". ${chosen.kind === "bioguide" ? `Photo served by the Biographical Directory of the U.S. Congress at ${chosen.url}` : `Biographical Directory photo is below 400x500; this copy is the GPO Congressional Pictorial Directory portrait republished by the unitedstates/images project at ${chosen.url}`} (${row.width}x${row.height}). Portrait supplied by or for the Member's office for public distribution by Congress; photographer not identified. Display basis is operator decision, not a public-domain determination.`,
        identity_verified: true, reviewed_by: REVIEWER, reviewed_at: checkedAt,
        changes: "Centre-cropped to 4:5, resized to at most 800x1000 JPEG, embedded metadata removed.",
      };
      if (federal) { manifest.push(entry); row.status = "manifest"; }
      else if (INCLUDE_HELD) { manifest.push(entry); row.status = `manifest_${attribution.kind}`; }
      else { memberSupplied.push(entry); row.status = `held_${attribution.kind}`; }
      if (report.length % 50 === 0) console.log(JSON.stringify({ processed: report.length, total: selected.length }));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  photoRightsManifest.parse(manifest); photoRightsManifest.parse(memberSupplied);
  mkdirSync(OUT_DIR, { recursive: true });
  const counts: Record<string, number> = {}; const attributions: Record<string, number> = {};
  for (const r of report) { counts[r.status] = (counts[r.status] ?? 0) + 1; if (r.attribution !== undefined) attributions[r.attribution || "<none>"] = (attributions[r.attribution || "<none>"] ?? 0) + 1; }
  const manifestPath = `${OUT_DIR}/federal-manifest-${STAMP}.json`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const heldPath = `${OUT_DIR}/federal-held-${STAMP}.json`;
  writeFileSync(heldPath, JSON.stringify(memberSupplied, null, 2) + "\n");
  const summary = { checked_at: checkedAt, scope: "current members of Congress matched by Bioguide ID; attribution from Congress.gov API; photo from bioguide.congress.gov; no database or storage change", profiles: rows.length, checked: report.length, counts, attributions, manifest: manifestPath, held: heldPath, include_held: INCLUDE_HELD };
  writeFileSync(`${OUT_DIR}/federal-report-${STAMP}.json`, JSON.stringify({ summary, rows: report }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
