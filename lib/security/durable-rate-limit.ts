import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

/** Fixed-size identifiers keep email addresses and IPs out of the rate table. */
export function rateLimitKey(scope: string, subject: string): string {
  return `${scope}:${createHash("sha256").update(subject).digest("hex")}`;
}

export async function durableRateLimit(key: string, limit: number, seconds: number): Promise<"allowed" | "limited" | "unavailable"> {
  try {
    const admin = createAdminClient();
    const rpc = admin.rpc.bind(admin) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    const result = await rpc("consume_security_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: seconds });
    if (result.error || typeof result.data !== "boolean") return "unavailable";
    return result.data ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}
