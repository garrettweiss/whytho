/**
 * Photo Pipeline — scalable politician photo acquisition + CDN migration
 *
 * Phase 1: Create Supabase Storage bucket (if needed)
 * Phase 2: Fill gaps from Wikidata (bioguide-keyed for federal, name-keyed for others)
 * Phase 3: Mirror all external photo_urls → Supabase Storage CDN
 * Phase 4: Coverage report
 *
 * Usage:
 *   npx tsx scripts/photo-pipeline.ts              # All phases
 *   npx tsx scripts/photo-pipeline.ts --dry-run    # Preview only, no writes
 *   npx tsx scripts/photo-pipeline.ts --phase=3    # Mirror only
 *   npx tsx scripts/photo-pipeline.ts --limit=100  # Test with first 100
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const BUCKET = "politician-photos";
const CONCURRENCY = 5;
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const WIKIDATA_UA = "WhyTho/1.0 (whytho.us; admin@whytho.us)";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || Infinity;
const PHASES = args.find((a) => a.startsWith("--phase="))?.split("=")[1]?.split(",").map(Number) ?? [1, 2, 3, 4];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function getStoragePublicUrl(politicianId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${politicianId}.jpg`;
}

// ── Phase 1: Ensure bucket ─────────────────────────────────────────────────

async function ensureBucket(): Promise<void> {
  console.log("\n[Phase 1] Ensuring Supabase Storage bucket...");

  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);

  if (exists) {
    console.log(`  ✓ Bucket '${BUCKET}' already exists`);
    return;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would create public bucket '${BUCKET}'`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });

  if (error) throw new Error(`Failed to create bucket: ${error.message}`);
  console.log(`  ✓ Created public bucket '${BUCKET}'`);
}

// ── Phase 2: Wikidata ──────────────────────────────────────────────────────

async function wikidataQuery(sparql: string): Promise<Record<string, { value: string }>[]> {
  const url = `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIDATA_UA, Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] };
  };
  return data.results.bindings;
}

async function fetchWikidataByBioguide(): Promise<Map<string, string>> {
  console.log("  Querying Wikidata (bioguide-keyed federal politicians)...");
  const sparql = `
    SELECT ?bioguide ?image WHERE {
      ?p wdt:P1157 ?bioguide.
      ?p wdt:P18 ?image.
    }
  `;
  const rows = await wikidataQuery(sparql);
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.bioguide && row.image) {
      map.set(row.bioguide.value, row.image.value);
    }
  }
  console.log(`  Found ${map.size} federal politicians with images in Wikidata`);
  return map;
}

async function fetchWikidataGovernors(): Promise<Map<string, string>> {
  console.log("  Querying Wikidata (US governors)...");
  const sparql = `
    SELECT DISTINCT ?pLabel ?image WHERE {
      ?p wdt:P27 wd:Q30.
      ?p wdt:P18 ?image.
      ?p p:P39 ?stmt.
      ?stmt ps:P39 ?pos.
      ?pos wdt:P279* wd:Q14212.
      OPTIONAL { ?stmt pq:P582 ?endDate. }
      FILTER(!BOUND(?endDate) || ?endDate > NOW())
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  try {
    const rows = await wikidataQuery(sparql);
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.pLabel && row.image && !map.has(row.pLabel.value)) {
        map.set(row.pLabel.value, row.image.value);
      }
    }
    console.log(`  Found ${map.size} US governors with images in Wikidata`);
    return map;
  } catch (e) {
    console.warn(`  Warning: governor query failed (${(e as Error).message}) — skipping`);
    return new Map();
  }
}

async function fetchWikidataByNames(names: string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  console.log(`  Querying Wikidata by name for ${names.length} politicians...`);

  // Batch into chunks of 300 (SPARQL VALUES limit)
  const map = new Map<string, string>();
  for (let i = 0; i < names.length; i += 300) {
    const chunk = names.slice(i, i + 300);
    const valuesList = chunk.map((n) => `"${n.replace(/"/g, '\\"')}"@en`).join(" ");
    const sparql = `
      SELECT ?pLabel ?image WHERE {
        VALUES ?pLabel { ${valuesList} }
        ?p rdfs:label ?pLabel.
        ?p wdt:P18 ?image.
        ?p wdt:P27 wd:Q30.
        FILTER(LANG(?pLabel) = "en")
      }
    `;
    try {
      const rows = await wikidataQuery(sparql);
      for (const row of rows) {
        if (row.pLabel && row.image && !map.has(row.pLabel.value)) {
          map.set(row.pLabel.value, row.image.value);
        }
      }
    } catch {
      // Partial failure ok — continue with next chunk
    }
    await new Promise((r) => setTimeout(r, 500)); // throttle Wikidata
  }
  console.log(`  Found ${map.size} name-matched politicians with images in Wikidata`);
  return map;
}

async function fillFromWikidata(): Promise<void> {
  console.log("\n[Phase 2] Filling photo gaps from Wikidata...");

  // Fetch all politicians missing a photo
  const { data: politicians, error } = await supabase
    .from("politicians")
    .select("id, full_name, bioguide_id, photo_url, office")
    .is("photo_url", null);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!politicians?.length) {
    console.log("  No politicians with null photo_url — skipping");
    return;
  }

  console.log(`  ${politicians.length} politicians with no photo`);

  // Parallel Wikidata queries
  const [bioguideMap, governorMap] = await Promise.all([
    fetchWikidataByBioguide(),
    fetchWikidataGovernors(),
  ]);

  // Collect names of non-federal politicians without a photo for name-based lookup
  const nonFederalWithoutBioguide = politicians.filter((p) => !p.bioguide_id).map((p) => p.full_name);
  const nameMap = await fetchWikidataByNames(nonFederalWithoutBioguide);

  let updated = 0;
  let noMatch = 0;
  let processed = 0;

  for (const p of politicians) {
    if (processed >= LIMIT) break;
    processed++;

    let newUrl: string | null = null;

    if (p.bioguide_id && bioguideMap.has(p.bioguide_id)) {
      newUrl = bioguideMap.get(p.bioguide_id)!;
    } else if (p.office?.toLowerCase().includes("governor") && governorMap.has(p.full_name)) {
      newUrl = governorMap.get(p.full_name)!;
    } else if (nameMap.has(p.full_name)) {
      newUrl = nameMap.get(p.full_name)!;
    }

    if (!newUrl) {
      noMatch++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] ${p.full_name}: ${newUrl.slice(0, 70)}...`);
      updated++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("politicians")
      .update({ photo_url: newUrl })
      .eq("id", p.id);

    if (updateError) {
      console.warn(`  Warning: failed to update ${p.full_name}: ${updateError.message}`);
    } else {
      updated++;
      if (updated % 50 === 0) console.log(`  Updated ${updated}...`);
    }
  }

  console.log(`  ✓ Wikidata phase: ${updated} filled, ${noMatch}/${politicians.length} no match`);
}

// ── Phase 3: Mirror to Supabase Storage ───────────────────────────────────

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": WIKIDATA_UA },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 500) return null; // Too small — likely error page

    return { buffer, contentType };
  } catch {
    return null;
  }
}

async function mirrorPhotos(): Promise<void> {
  console.log("\n[Phase 3] Mirroring photos to Supabase Storage...");

  // Paginate through all politicians with external photo_urls
  const politicians: { id: string; full_name: string; photo_url: string | null }[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("politicians")
      .select("id, full_name, photo_url")
      .not("photo_url", "is", null)
      .not("photo_url", "like", `%${supabaseUrl}%`)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data?.length) break;
    politicians.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (!politicians.length) {
    console.log("  All photos already in Supabase Storage — nothing to mirror");
    return;
  }

  const toProcess = politicians.slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`  ${toProcess.length} politicians need photo mirroring`);

  if (DRY_RUN) {
    console.log(`  [dry-run] Would mirror ${toProcess.length} photos`);
    const sample = toProcess.slice(0, 5);
    for (const p of sample) {
      console.log(`    ${p.full_name}: ${p.photo_url?.slice(0, 70)}...`);
    }
    return;
  }

  let mirrored = 0;
  let failed = 0;
  let skipped = 0;

  // Process in batches for parallel downloads
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const chunk = toProcess.slice(i, i + CONCURRENCY);

    await Promise.all(
      chunk.map(async (p) => {
        if (!p.photo_url) return;

        const downloaded = await downloadImage(p.photo_url);
        if (!downloaded) {
          failed++;
          return;
        }

        const path = `${p.id}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, downloaded.buffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          // Bucket might enforce JPEG — try with original content type
          const { error: uploadError2 } = await supabase.storage
            .from(BUCKET)
            .upload(path, downloaded.buffer, {
              contentType: downloaded.contentType,
              upsert: true,
            });
          if (uploadError2) {
            failed++;
            return;
          }
        }

        const publicUrl = getStoragePublicUrl(p.id);
        const { error: updateError } = await supabase
          .from("politicians")
          .update({ photo_url: publicUrl })
          .eq("id", p.id);

        if (updateError) {
          failed++;
        } else {
          mirrored++;
        }
      })
    );

    if ((i + CONCURRENCY) % 200 === 0) {
      const pct = Math.round(((i + CONCURRENCY) / toProcess.length) * 100);
      console.log(
        `  Progress: ${Math.min(i + CONCURRENCY, toProcess.length)}/${toProcess.length} (${pct}%) — ✓${mirrored} ✗${failed}`
      );
    }

    // Small throttle to avoid hammering external sources
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`  ✓ Mirror phase: ${mirrored} mirrored, ${failed} failed, ${skipped} skipped`);
}

// ── Phase 4: Coverage report ───────────────────────────────────────────────

async function reportCoverage(): Promise<void> {
  console.log("\n[Phase 4] Coverage report...");

  const data: { office: string | null; photo_url: string | null }[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data: page, error } = await supabase
      .from("politicians")
      .select("office, photo_url")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!page?.length) break;
    data.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const total = data?.length ?? 0;
  const withPhoto = data?.filter((p) => p.photo_url).length ?? 0;
  const inStorage = data?.filter((p) => p.photo_url?.includes(supabaseUrl)).length ?? 0;
  const external = withPhoto - inStorage;
  const missing = total - withPhoto;
  const coveragePct = Math.round((withPhoto / total) * 100);

  console.log(`
  ╔══════════════════════════════════════════╗
  ║         PHOTO COVERAGE REPORT           ║
  ╠══════════════════════════════════════════╣
  ║ Total politicians:     ${String(total).padStart(5)}             ║
  ║ With photos:           ${String(withPhoto).padStart(5)} (${String(coveragePct).padStart(3)}%)         ║
  ║   → In Supabase CDN:   ${String(inStorage).padStart(5)}             ║
  ║   → External URLs:     ${String(external).padStart(5)}             ║
  ║ No photo:              ${String(missing).padStart(5)}             ║
  ╚══════════════════════════════════════════╝`);

  // Coverage by office type
  const byOffice: Record<string, { total: number; withPhoto: number }> = {};
  for (const p of data ?? []) {
    const office = p.office ?? "Unknown";
    if (!byOffice[office]) byOffice[office] = { total: 0, withPhoto: 0 };
    byOffice[office].total++;
    if (p.photo_url) byOffice[office].withPhoto++;
  }

  console.log("\n  By office:");
  const sorted = Object.entries(byOffice)
    .filter(([, s]) => s.total >= 5)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);

  for (const [office, stats] of sorted) {
    const pct = Math.round((stats.withPhoto / stats.total) * 100);
    const filled = Math.round(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    console.log(
      `  ${office.slice(0, 30).padEnd(31)} ${bar} ${String(pct).padStart(3)}% (${stats.withPhoto}/${stats.total})`
    );
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = DRY_RUN ? "DRY RUN" : "LIVE";
  console.log(`
╔════════════════════════════════════════╗
║       WhyTho Photo Pipeline            ║
║       Mode: ${mode.padEnd(27)}║
║       Phases: ${PHASES.join(", ").padEnd(25)}║
╚════════════════════════════════════════╝`);

  if (PHASES.includes(1)) await ensureBucket();
  if (PHASES.includes(2)) await fillFromWikidata();
  if (PHASES.includes(3)) await mirrorPhotos();
  if (PHASES.includes(4)) await reportCoverage();

  console.log("\n✅ Photo pipeline complete\n");
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
