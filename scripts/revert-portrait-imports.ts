/**
 * Reverse specific imports made by scripts/photo-pipeline.ts, using its apply logs as the source of truth.
 * Restores photo_url to the logged old_url and clears the imported source, credit and rights basis, only when
 * the profile still shows the imported URL. Storage objects are retained. Dry-run by default.
 *
 *   npx tsx scripts/revert-portrait-imports.ts --ids=<json array of politician_id> --logs=<apply log>,<apply log>
 *   npx tsx scripts/revert-portrait-imports.ts --ids=... --logs=... --apply
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
try { process.loadEnvFile(".env.local"); } catch { /* environment may be injected */ }
const args = process.argv.slice(2);
const flag = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
const APPLY = args.includes("--apply");
const ids = new Set(JSON.parse(readFileSync(flag("ids")!, "utf8")) as string[]);
type Log = { politician_id: string; status: string; new_url: string; old_url: string | null };
const logs = (flag("logs") ?? "").split(",").filter(Boolean).flatMap(path => readFileSync(path, "utf8").split("\n").filter(l => l.startsWith("{\"politician_id\"")).map(l => JSON.parse(l) as Log));
const latest = new Map<string, Log>();
for (const log of logs) if (log.status === "published" && ids.has(log.politician_id)) latest.set(log.politician_id, log);
const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
async function main() {
  const results: Record<string, unknown>[] = []; const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  for (const id of ids) {
    const log = latest.get(id);
    if (!log) { bump("no_published_log"); results.push({ politician_id: id, status: "no_published_log" }); continue; }
    const { data: row, error } = await db.from("politicians").select("slug,photo_url").eq("id", id).maybeSingle();
    if (error || !row) { bump("missing_row"); results.push({ politician_id: id, status: "missing_row" }); continue; }
    if (row.photo_url !== log.new_url) { bump("changed_since_import"); results.push({ politician_id: id, slug: row.slug, status: "changed_since_import" }); continue; }
    if (!APPLY) { bump("would_revert"); results.push({ politician_id: id, slug: row.slug, status: "would_revert", restore: log.old_url }); continue; }
    const { data, error: updateError } = await db.from("politicians")
      .update({ photo_url: log.old_url, photo_source_url: null, photo_credit: null, photo_rights_basis: null })
      .eq("id", id).eq("photo_url", log.new_url).select("id");
    if (updateError) { bump("error"); results.push({ politician_id: id, slug: row.slug, status: "error", detail: updateError.message }); continue; }
    bump(data?.length ? "reverted" : "changed_since_check"); results.push({ politician_id: id, slug: row.slug, status: data?.length ? "reverted" : "changed_since_check", restored: log.old_url, removed: log.new_url });
  }
  const out = flag("out") ?? `docs/launch/evidence/photos/revert-${APPLY ? "applied" : "preview"}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
  writeFileSync(out, JSON.stringify({ mode: APPLY ? "apply" : "preview", counts, results }, null, 2) + "\n");
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "preview", counts, out }));
  if (APPLY && process.env.ADMIN_SECRET) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("localhost") || !process.env.NEXT_PUBLIC_SITE_URL ? "https://whytho.us" : process.env.NEXT_PUBLIC_SITE_URL;
    const res = await fetch(`${site}/api/admin/identities/revalidate`, { method: "POST", headers: { "x-admin-secret": process.env.ADMIN_SECRET } });
    console.log(JSON.stringify({ revalidate: site, status: res.status }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
