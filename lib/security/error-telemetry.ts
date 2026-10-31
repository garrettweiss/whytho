/** Keep operational error metadata without transmitting civic choices or identity. */
import type { ErrorEvent } from "@sentry/nextjs";

export function scrubErrorTelemetry(event: ErrorEvent): ErrorEvent {
  const safe: ErrorEvent = {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    exception: event.exception ? { values: event.exception.values?.map(exception => ({
      type: exception.type,
      value: "Application error (message omitted for privacy)",
      stacktrace: { frames: exception.stacktrace?.frames?.map(frame => ({
        filename: typeof frame.filename === "string" ? frame.filename.split(/[?#]/)[0] : undefined,
        function: frame.function,
        module: frame.module,
        lineno: frame.lineno,
        colno: frame.colno,
        in_app: frame.in_app,
      })) },
    })) } : undefined,
  };
  // Intentionally omit request, user, extra, contexts, breadcrumbs, tags,
  // transaction names, arbitrary messages and source-context snippets.
  return safe;
}
