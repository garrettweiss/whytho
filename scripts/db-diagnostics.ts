/**
 * Forensic capture. RUN THIS BEFORE RESTARTING THE DATABASE.
 *
 * Postgres statistics reset on restart. During the August 2026 outage the
 * instance was restarted to recover service, which destroyed pg_stat_activity,
 * pg_stat_statements and every table and index statistic before anything read
 * them. Root cause was never established.
 *
 * This script snapshots everything durable to a timestamped file so the next
 * incident can be diagnosed after the fact.
 *
 * Usage:
 *   npx tsx scripts/db-diagnostics.ts
 *
 * Requires the Supabase CLI to be logged in and the project linked. It does not
 * need the database password.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

const PROJECT_REF = "jjwdxjqsnwieksubkkkf";
const OUT_DIR = "diagnostics";

/** Durable or otherwise high-signal views, captured in priority order. */
const INSPECTIONS = [
  "db-stats",
  "long-running-queries",
  "locks",
  "blocking",
  "replication-slots",
  "role-connections",
  "outliers",
  "table-stats",
  "index-stats",
  "vacuum-stats",
  "bloat",
] as const;

function runInspection(cmd: string): unknown {
  try {
    const raw = execSync(
      `supabase inspect db ${cmd} --linked --project-ref ${PROJECT_REF} 2>/dev/null`,
      { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] }
    );
    const line = raw.split("\n").find((l) => l.trim().startsWith("{"));
    return line ? JSON.parse(line) : { raw: raw.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchVitals(): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "missing SUPABASE env vars" };

  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_db_vitals`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}`, body: await res.text() };
    return await res.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchHealth(): Promise<unknown> {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.includes("localhost")
    ? "https://whytho.us"
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://whytho.us");
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(30_000) });
    return { status: res.status, body: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Capturing diagnostics at ${startedAt.toISOString()}`);
  console.log("Do not restart the database until this completes.\n");

  const report: Record<string, unknown> = {
    captured_at: startedAt.toISOString(),
    project_ref: PROJECT_REF,
  };

  console.log("→ /api/health");
  report.health = await fetchHealth();

  console.log("→ get_db_vitals()");
  report.vitals = await fetchVitals();

  for (const cmd of INSPECTIONS) {
    process.stdout.write(`→ inspect ${cmd} ... `);
    report[cmd.replace(/-/g, "_")] = runInspection(cmd);
    console.log("done");
  }

  const outPath = join(OUT_DIR, `diagnostics-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\nWrote ${outPath}`);
  console.log("Attach this file to the incident notes before restarting.");
}

main().catch((err) => {
  console.error("Diagnostics capture failed:", err);
  process.exit(1);
});
