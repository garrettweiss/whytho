/** Read-only public inventory + completed local audit -> editorial review CSV. */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile(".env.local"); } catch { /* injected environment is supported */ }
const auditPath = process.argv[2] ?? "docs/launch/evidence/portrait-quality-v2.jsonl";
const outputPath = process.argv[3] ?? "docs/launch/evidence/portrait-review-queue.csv";
type Audit = { id: string; status: string; width?: number; height?: number };
type Person = { id: string; slug: string; office: string | null; is_candidate: boolean; photo_url: string | null };
async function main() {
const audit = new Map(readFileSync(auditPath, "utf8").split("\n").filter(Boolean).map(line => {
  const row = JSON.parse(line) as Audit;
  return [row.id, row];
}));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const people: Person[] = [];
for (let offset = 0;; offset += 1000) {
  const { data, error } = await db.from("politicians").select("id,slug,office,is_candidate,photo_url")
    .eq("is_active", true).eq("is_test", false).order("id").range(offset, offset + 999);
  if (error) throw new Error(error.message);
  people.push(...data);
  if (data.length < 1000) break;
}
const rows = people.map(person => {
  const result = audit.get(person.id);
  const status = person.photo_url?.trim() ? result?.status ?? "not_checked" : "missing_photo";
  const sufficient = (result?.width ?? 0) >= 400 && (result?.height ?? 0) >= 500;
  const priority = status === "missing_photo" || !["usable_dimensions", "small_portrait", "too_small"].includes(status) ? 1 : sufficient ? 3 : 2;
  return { priority, person, result, status, sufficient };
}).sort((a, b) => a.priority - b.priority || a.person.slug.localeCompare(b.person.slug));
const cell = (value: unknown) => {
  const text = String(value ?? "");
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
};
const header = ["repair_priority", "politician_id", "slug", "office", "candidate", "quality_status", "width", "height", "meets_upload_dimensions", "rights_status", "required_action", "source_page", "creator", "license", "reviewed_by", "reviewed_at"];
const lines = rows.map(({ priority, person, result, status, sufficient }) => [
  priority, person.id, person.slug, person.office, person.is_candidate, status, result?.width, result?.height, sufficient,
  "unreviewed", sufficient ? "Verify exact identity, provenance, license, crop and visual quality" : "Obtain larger approved portrait; verify identity, provenance and license",
  "", "", "", "", "",
].map(cell).join(","));
// A new output path avoids silently overwriting an editorial review in progress.
writeFileSync(outputPath, [header.map(cell).join(","), ...lines].join("\n") + "\n", { flag: "wx" });
console.log(JSON.stringify({ rows: rows.length, missing: rows.filter(row => row.status === "missing_photo").length, meets_upload_dimensions: rows.filter(row => row.sufficient).length, output: outputPath }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
