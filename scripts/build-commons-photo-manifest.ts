/**
 * Build a photo rights manifest from Wikimedia Commons for profiles that Wikidata can identify by a
 * stable identifier: Bioguide ID (P1157) or a verified X username (P2002). Name-only matching is not used.
 * Read-only: queries the database, Wikidata SPARQL and the Commons API. Writes manifest + report JSON.
 *
 *   npx tsx scripts/build-commons-photo-manifest.ts --scope=governors
 *   npx tsx scripts/build-commons-photo-manifest.ts --scope=all --skip-manifest=docs/launch/evidence/photos/federal-manifest-20261125.json
 *
 * --key=position matches instead by office and state: the living current holder of the Wikidata position
 * (Governor of <state>, member of the <state> lower/upper house) whose first and last name match ours, unique on both
 * sides, with districts compared when both sides record one. This is a structured match, not an identifier; its
 * output is kept in separate files so it can be reviewed or approved as a class.
 *   npx tsx scripts/build-commons-photo-manifest.ts --key=position --scope=governors
 *   npx tsx scripts/build-commons-photo-manifest.ts --key=position --scope=legislators
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { photoRightsManifest, type PhotoRights } from "../lib/photos/rights";
import { PORTRAIT_MIN_HEIGHT, PORTRAIT_MIN_WIDTH } from "../lib/photos/policy";
import { commonsFilePage, commonsLicense, commonsTitleFromFilePath, districtKey, fullNameMatches, nameTokens, stripTags, surnameMatches, type CommonsExtMetadata } from "../lib/photos/manifest-sources";
try { process.loadEnvFile(".env.local"); } catch { /* environment may be injected */ }

const args = process.argv.slice(2);
const flag = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
const SCOPE = flag("scope") ?? "all"; // governors | federal | all | legislators (position key only)
const KEY = flag("key") ?? "identifier"; // identifier | position
const LIMIT = Number(flag("limit") ?? Infinity);
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUT_DIR = flag("out") ?? "docs/launch/evidence/photos";
const SKIP = new Set((flag("skip-manifest") ?? "").split(",").filter(Boolean).flatMap(path => (JSON.parse(readFileSync(path, "utf8")) as PhotoRights[]).map(r => r.politician_id)));
const UA = "WhyThoPhotoImport/1.0 (+https://whytho.us; admin@whytho.us)";
const REVIEWER = KEY === "position"
  ? "scripts/build-commons-photo-manifest.ts (Wikidata office-and-state position match, full name, living current holder, unique + Commons extmetadata license, automated check)"
  : "scripts/build-commons-photo-manifest.ts (Wikidata identifier match + Commons extmetadata license, automated check)";
const LEGISLATOR_OFFICES: Record<string, "lower" | "upper"> = { "State Representative": "lower", "State Senator": "upper", "Senator": "upper" };
const THUMB_WIDTH = 1200;

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
type Person = { id: string; slug: string; full_name: string; office: string | null; state: string | null; district: string | null; bioguide_id: string | null; photo_url: string | null; photo_source_url: string | null; social_handles: Record<string, string> | null };
type Key = { property: "P1157" | "P2002"; value: string };

async function people(): Promise<Person[]> {
  const rows: Person[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("politicians").select("id,slug,full_name,office,state,district,bioguide_id,photo_url,photo_source_url,social_handles").eq("is_active", true).eq("is_test", false).order("id").range(offset, offset + 999);
    if (SCOPE === "governors") query = query.eq("office", "Governor");
    if (SCOPE === "federal") query = query.not("bioguide_id", "is", null);
    if (SCOPE === "legislators") query = query.in("office", Object.keys(LEGISLATOR_OFFICES)).not("openstates_id", "is", null);
    const { data, error } = await query; if (error) throw new Error(error.message);
    rows.push(...(data as Person[])); if (data.length < 1000) return rows;
  }
}
function keyFor(p: Person): Key | null {
  if (p.bioguide_id) return { property: "P1157", value: p.bioguide_id.toUpperCase() };
  const handle = p.social_handles?.twitter ?? p.social_handles?.x;
  if (handle && p.social_handles?.twitter_confidence === "verified") return { property: "P2002", value: handle.replace(/^@/, "") };
  return null;
}
type WdHit = { item: string; label: string; image: string };
async function wikidata(property: Key["property"], values: string[]): Promise<Map<string, WdHit[]>> {
  const hits = new Map<string, WdHit[]>();
  for (let i = 0; i < values.length; i += 150) {
    const chunk = values.slice(i, i + 150).map(v => JSON.stringify(v)).join(" ");
    const query = `SELECT ?item ?itemLabel ?ext ?image WHERE { VALUES ?ext { ${chunk} } ?item wdt:${property} ?ext . ?item wdt:P18 ?image . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
    const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
    if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`);
    const body = await res.json() as { results: { bindings: Record<string, { value: string }>[] } };
    for (const b of body.results.bindings) {
      const key = property === "P2002" ? b.ext!.value.toLowerCase() : b.ext!.value.toUpperCase();
      hits.set(key, [...(hits.get(key) ?? []), { item: b.item!.value, label: b.itemLabel?.value ?? "", image: b.image!.value }]);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  // The label service sometimes returns the bare item ID; fetch English labels for those before the name check.
  const unlabeled = [...new Set([...hits.values()].flat().filter(h => /^Q\d+$/.test(h.label)).map(h => h.item.split("/").pop()!))];
  for (let i = 0; i < unlabeled.length; i += 50) {
    const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${unlabeled.slice(i, i + 50).join("|")}&props=labels&languages=en&format=json`, { headers: { "User-Agent": UA } });
    if (!res.ok) break;
    const body = await res.json() as { entities?: Record<string, { labels?: { en?: { value: string } } }> };
    for (const list of hits.values()) for (const h of list) { const label = body.entities?.[h.item.split("/").pop()!]?.labels?.en?.value; if (label) h.label = label; }
  }
  return hits;
}
type Chamber = "governor" | "lower" | "upper";
type PositionHit = { state: string; chamber: Chamber; item: string; label: string; image: string; district: string | null; start: string | null };
async function sparql(query: string): Promise<Record<string, { value: string }>[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
    if (res.ok) return ((await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }).results.bindings;
    if (res.status !== 429 && res.status < 500) throw new Error(`Wikidata SPARQL ${res.status}`);
    await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error("Wikidata SPARQL unavailable");
}
/** Living current holders of Governor of <state> or member of a state chamber, with an image. */
async function positionHolders(chambers: Chamber[], states: string[]): Promise<PositionHit[]> {
  const hits: PositionHit[] = [];
  const common = `?state wdt:P300 ?iso . ?item p:P39 ?st . ?st ps:P39 ?pos . FILTER NOT EXISTS { ?st pq:P582 ?end } FILTER NOT EXISTS { ?item wdt:P570 ?death } ?item wdt:P18 ?image . OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P768 ?district } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;
  for (let i = 0; i < states.length; i += 10) {
    const isoValues = states.slice(i, i + 10).map(code => JSON.stringify(`US-${code}`)).join(" ");
    for (const chamber of chambers) {
      const position = chamber === "governor" ? `?pos wdt:P31 wd:Q889821 ; wdt:P1001 ?state .`
        : chamber === "lower" ? `?pos wdt:P279 wd:Q106079967 ; wdt:P1001 ?state .`
        : `?pos wdt:P31 wd:Q4164871 ; wdt:P1001 ?state ; rdfs:label ?posLabel . FILTER(LANG(?posLabel) = "en" && CONTAINS(?posLabel, "Senate") && STRSTARTS(?posLabel, "member of the"))`;
      const rows = await sparql(`SELECT ?iso ?item ?itemLabel ?image ?start ?districtLabel WHERE { VALUES ?iso { ${isoValues} } ${position} ${common} }`);
      for (const b of rows) hits.push({ state: b.iso!.value.replace(/^US-/, ""), chamber, item: b.item!.value.split("/").pop()!, label: b.itemLabel?.value ?? "", image: b.image!.value, district: b.districtLabel?.value ?? null, start: b.start?.value ?? null });
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return hits;
}
function chamberFor(p: Person): Chamber | null {
  if (p.office === "Governor") return "governor";
  return LEGISLATOR_OFFICES[p.office ?? ""] ?? null;
}
type ImageInfo = { title: string; url: string; thumburl?: string; width: number; height: number; mime: string; extmetadata: CommonsExtMetadata };
async function commons(titles: string[]): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  for (let i = 0; i < titles.length; i += 50) {
    const params = new URLSearchParams({ action: "query", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(THUMB_WIDTH), titles: titles.slice(i, i + 50).join("|"), format: "json", redirects: "1" });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Commons API ${res.status}`);
    const body = await res.json() as { query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages: Record<string, { title: string; imageinfo?: Omit<ImageInfo, "title">[] }> } };
    const alias = new Map<string, string>();
    for (const n of [...(body.query?.normalized ?? []), ...(body.query?.redirects ?? [])]) alias.set(n.to, alias.get(n.from) ?? n.from);
    for (const page of Object.values(body.query?.pages ?? {})) {
      const info = page.imageinfo?.[0]; if (!info) continue;
      const original = alias.get(page.title) ?? page.title;
      out.set(original, { ...info, title: page.title });
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return out;
}

type Row = { politician_id: string; slug: string; office: string | null; key?: string; status: string; wikidata?: string; file?: string; license?: string; width?: number; height?: number; detail?: string };
async function main() {
  const rows = (await people()).filter(p => !SKIP.has(p.id)).slice(0, LIMIT);
  const candidates: { p: Person; hit: WdHit; title: string; identity: string }[] = []; const report: Row[] = [];
  if (KEY === "position") {
    const states = [...new Set(rows.map(p => p.state).filter((s): s is string => !!s && /^[A-Z]{2}$/.test(s)))].sort();
    const chambers = [...new Set(rows.map(chamberFor).filter((c): c is Chamber => !!c))];
    console.log(JSON.stringify({ scope: SCOPE, key: KEY, profiles: rows.length, states: states.length, chambers }));
    const holders = await positionHolders(chambers, states);
    console.log(JSON.stringify({ wikidata_living_current_holders_with_image: holders.length }));
    const matches = new Map<string, PositionHit[]>();
    for (const p of rows) {
      const chamber = chamberFor(p);
      if (!chamber || !p.state) continue;
      const pool = holders.filter(h => h.state === p.state && h.chamber === chamber && (chamber === "governor" ? surnameMatches(p.full_name, h.label) && fullNameMatches(p.full_name, h.label) : fullNameMatches(p.full_name, h.label)));
      const ours = districtKey(p.district);
      const consistent = pool.filter(h => { const theirs = districtKey(h.district); return !ours || !theirs || ours === theirs; });
      const distinct = [...new Map(consistent.map(h => [h.item, h])).values()];
      matches.set(p.id, distinct);
    }
    for (const p of rows) {
      const row: Row = { politician_id: p.id, slug: p.slug, office: p.office, key: `position:${p.state}/${chamberFor(p) ?? "?"}`, status: "pending" }; report.push(row);
      const distinct = matches.get(p.id);
      if (!distinct) { row.status = "office_not_supported"; continue; }
      if (!distinct.length) { row.status = "no_wikidata_match"; continue; }
      if (distinct.length > 1) { row.status = "ambiguous_name"; row.detail = distinct.map(h => `${h.item} ${h.label}`).join(" | "); continue; }
      const hit = distinct[0]!;
      // Duplicate profiles of one person may share an item; different names sharing an item are a conflict.
      const sharers = rows.filter(other => matches.get(other.id)?.some(h => h.item === hit.item));
      if (sharers.some(other => nameTokens(other.full_name).join(" ") !== nameTokens(p.full_name).join(" ") && !fullNameMatches(other.full_name, p.full_name))) { row.status = "ambiguous_shared_item"; row.detail = `${hit.item}: ${sharers.map(o => o.slug).join(", ")}`; continue; }
      if (sharers.length > 1) row.detail = `shared with duplicate profile(s): ${sharers.filter(o => o.id !== p.id).map(o => o.slug).join(", ")}`;
      row.wikidata = hit.item;
      const title = commonsTitleFromFilePath(hit.image); if (!title) { row.status = "bad_image_url"; continue; }
      row.file = title;
      candidates.push({ p, hit: { item: hit.item, label: hit.label, image: hit.image }, title, identity: `office-and-state match: ${p.state} ${chamberFor(p)}; Wikidata living current holder ${hit.item} "${hit.label}"${hit.start ? ` since ${hit.start.slice(0, 10)}` : ""}${hit.district ? `, ${hit.district}` : ""}; first and last name match; unique on both sides` });
    }
  } else {
  const keyed = rows.map(p => ({ p, key: keyFor(p) }));
  const byProperty: Record<Key["property"], string[]> = { P1157: [], P2002: [] };
  for (const { key } of keyed) if (key) byProperty[key.property].push(key.value);
  console.log(JSON.stringify({ scope: SCOPE, profiles: rows.length, keyed_bioguide: byProperty.P1157.length, keyed_verified_x: byProperty.P2002.length, unkeyed: keyed.filter(k => !k.key).length }));
  const [hitsBio, hitsX] = await Promise.all([wikidata("P1157", byProperty.P1157), wikidata("P2002", byProperty.P2002)]);
  for (const { p, key } of keyed) {
    const row: Row = { politician_id: p.id, slug: p.slug, office: p.office, key: key ? `${key.property}:${key.value}` : undefined, status: "pending" }; report.push(row);
    if (!key) { row.status = "no_stable_identifier"; continue; }
    const hits = (key.property === "P1157" ? hitsBio : hitsX).get(key.property === "P2002" ? key.value.toLowerCase() : key.value) ?? [];
    if (!hits.length) { row.status = "no_wikidata_image"; continue; }
    const hit = hits[0]!; row.wikidata = hit.item;
    if (hits.some(h => h.item !== hit.item)) { row.status = "ambiguous_identifier"; continue; }
    if (!surnameMatches(p.full_name, hit.label)) { row.status = "identity_mismatch"; row.detail = hit.label; continue; }
    const title = commonsTitleFromFilePath(hit.image); if (!title) { row.status = "bad_image_url"; continue; }
    row.file = title; candidates.push({ p, hit, title, identity: `Wikidata item ${hit.item} carries identifier ${row.key}` });
  }
  }
  const infos = await commons([...new Set(candidates.map(c => c.title))]);
  const checkedAt = new Date().toISOString(); const manifest: PhotoRights[] = [];
  for (const { p, title, identity } of candidates) {
    const row = report.find(r => r.politician_id === p.id)!; const info = infos.get(title);
    if (!info) { row.status = "commons_missing"; continue; }
    row.width = info.width; row.height = info.height;
    if (!/^image\/(jpeg|png|webp)$/.test(info.mime)) { row.status = "unsupported_format"; row.detail = info.mime; continue; }
    if (info.width < PORTRAIT_MIN_WIDTH || info.height < PORTRAIT_MIN_HEIGHT) { row.status = "source_too_small"; continue; }
    const license = commonsLicense(info.extmetadata);
    if (!license.license) { row.status = "license_unresolved"; row.detail = license.reason; continue; }
    row.license = license.license;
    const source_url = (info.width > THUMB_WIDTH && info.thumburl ? info.thumburl : info.url).replace(/^http:/, "https:");
    if (p.photo_source_url === source_url && p.photo_url?.includes("/politician-photos/")) { row.status = "already_current"; continue; }
    const artist = stripTags(info.extmetadata.Artist?.value) || stripTags(info.extmetadata.Credit?.value) || "Unknown author (Wikimedia Commons)";
    manifest.push({
      politician_id: p.id, source_url, source_page: commonsFilePage(info.title), creator: artist.slice(0, 200),
      license: license.license, license_url: license.license_url,
      evidence: `${identity}; Wikidata image ${info.title}; Wikimedia Commons extmetadata (checked ${checkedAt}) reports ${stripTags(info.extmetadata.LicenseShortName?.value) || "no short name"}; ${license.basis}. Original ${info.width}x${info.height} ${info.mime}; imported from ${source_url}.`,
      identity_verified: true, reviewed_by: REVIEWER, reviewed_at: checkedAt,
      changes: "Centre-cropped to 4:5, resized to at most 800x1000 JPEG, embedded metadata removed.",
    });
    row.status = "manifest";
  }
  photoRightsManifest.parse(manifest);
  mkdirSync(OUT_DIR, { recursive: true });
  const counts: Record<string, number> = {}; const licenses: Record<string, number> = {}; const unresolved: Record<string, number> = {};
  for (const r of report) { counts[r.status] = (counts[r.status] ?? 0) + 1; if (r.license) licenses[r.license] = (licenses[r.license] ?? 0) + 1; if (r.status === "license_unresolved") unresolved[r.detail ?? "?"] = (unresolved[r.detail ?? "?"] ?? 0) + 1; }
  const suffix = KEY === "position" ? `${SCOPE}-position` : SCOPE;
  const manifestPath = `${OUT_DIR}/commons-manifest-${suffix}-${STAMP}.json`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const summary = { checked_at: checkedAt, scope: SCOPE, key: KEY, note: KEY === "position" ? "office-and-state keyed Wikidata match (living current holder, full name, unique, district-consistent); Commons extmetadata license; no database or storage change" : "identifier-keyed Wikidata match (Bioguide P1157 or verified X username P2002); Commons extmetadata license; no database or storage change", profiles: rows.length, counts, licenses, unresolved, manifest: manifestPath };
  writeFileSync(`${OUT_DIR}/commons-report-${suffix}-${STAMP}.json`, JSON.stringify({ summary, rows: report }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
