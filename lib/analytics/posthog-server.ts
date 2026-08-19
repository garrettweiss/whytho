/**
 * Server-side PostHog capture.
 *
 * Deliberately dependency-free (plain fetch against the capture API) and
 * deliberately external: database vitals must be stored somewhere that survives
 * the database going down, otherwise they are unreadable exactly when needed.
 */

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export async function captureServerEvent(
  event: string,
  properties: Record<string, unknown>,
  distinctId = "system"
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  try {
    await fetch(`${HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "whytho-server" },
      }),
      // Never let telemetry delay or fail the caller.
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Telemetry is best-effort by design.
  }
}
