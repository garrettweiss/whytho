/**
 * Next.js instrumentation hook.
 *
 * Without this file, @sentry/nextjs v10 on Next 15 never captures errors thrown
 * in Server Components or route handlers: `onRequestError` is the only channel
 * for them. Its absence is part of why the August 2026 outage went unreported
 * for so long, alongside pages that degraded to empty rather than throwing.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
