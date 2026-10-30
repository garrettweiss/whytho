/**
 * Health endpoint.
 *
 * Built after the August 2026 outage, during which whytho.us returned HTTP 200
 * with "0 politicians tracked" for an extended period while the uptime monitor
 * reported 100.000% availability. A status-code check could not see the failure.
 *
 * This endpoint asserts on truth rather than reachability, and returns 503 when
 * any assertion fails so a plain status check catches it.
 *
 * It also records database vitals to PostHog on every call. Point the uptime
 * monitor here and that becomes a continuous external time series, which is what
 * makes the next incident diagnosable: the trailing history survives even when
 * the database does not.
 *
 * The status and checks are public by design (the monitor fetches them without
 * credentials, and the counts are already public on the site). The vitals block
 * is internal operations telemetry and is returned only to callers presenting
 * the ADMIN_SECRET header; it is still captured to PostHog on every call.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/db/query-timeout";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHECK_TIMEOUT_MS = 4_000;
/** Slow but serving still warrants attention: the last outage began as latency. */
const LATENCY_WARN_MS = 2_000;
/** Each call runs three queries plus the vitals RPC; keep a public endpoint from becoming load. */
const PER_IP_LIMIT = 30;
const PER_IP_WINDOW_MS = 60_000;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export async function GET(request: Request) {
  const limit = rateLimit(`health:ip:${clientIp(request)}`, PER_IP_LIMIT, PER_IP_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, status: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const adminSecret = process.env.ADMIN_SECRET;
  const isAdmin = !!adminSecret && request.headers.get("x-admin-secret") === adminSecret;

  const startedAt = Date.now();
  const supabase = createAdminClient();
  const checks: Check[] = [];

  const run = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const detail = await withTimeout(fn(), name, CHECK_TIMEOUT_MS);
      checks.push({ name, ok: true, detail, ms: Date.now() - t0 });
    } catch (err) {
      checks.push({
        name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t0,
      });
    }
  };

  // 1. Postgres reachable and the politician corpus is present.
  await run("politicians_present", async () => {
    const { count, error } = await supabase
      .from("politicians")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("politician count is 0, database degraded or empty");
    return `${count} active politicians`;
  });

  // 2. Question corpus is present.
  await run("questions_present", async () => {
    const { count, error } = await supabase
      .from("questions")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    if (!count) throw new Error("question count is 0, database degraded or empty");
    return `${count} questions`;
  });

  // 3. Stored functions execute (exercises more than plain table reads).
  await run("rpc_current_week", async () => {
    const { data, error } = await supabase.rpc("current_week_number");
    if (error) throw new Error(error.message);
    if (typeof data !== "number") throw new Error(`unexpected week value: ${JSON.stringify(data)}`);
    return `week ${data}`;
  });

  // Vitals are advisory: absence must never fail the health check, since the
  // migration adding get_db_vitals may not be applied yet.
  //
  // The generated Database types do not know about get_db_vitals until the
  // migration is applied and `supabase gen types` is re-run, so the call is made
  // through a narrow untyped shim rather than widening the client types.
  type UntypedRpc = (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;

  let vitals: Record<string, unknown> | null = null;
  try {
    const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
    const { data } = await withTimeout(rpc("get_db_vitals"), "get_db_vitals", CHECK_TIMEOUT_MS);
    if (data && typeof data === "object") {
      vitals = data as Record<string, unknown>;
    }
  } catch {
    // Advisory only.
  }

  const totalMs = Date.now() - startedAt;
  const failed = checks.filter((c) => !c.ok);
  const ok = failed.length === 0;
  const degraded = ok && totalMs > LATENCY_WARN_MS;

  await captureServerEvent("db_health_check", {
    ok,
    degraded,
    total_ms: totalMs,
    failed_checks: failed.map((c) => c.name),
    ...checks.reduce<Record<string, unknown>>((acc, c) => {
      acc[`check_${c.name}_ok`] = c.ok;
      acc[`check_${c.name}_ms`] = c.ms;
      return acc;
    }, {}),
    ...(vitals ?? {}),
  });

  return NextResponse.json(
    {
      ok,
      status: ok ? (degraded ? "degraded" : "healthy") : "unhealthy",
      total_ms: totalMs,
      checked_at: new Date().toISOString(),
      checks,
      // Internal telemetry: omitted from the public response, admin header only.
      ...(isAdmin ? { vitals } : {}),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
