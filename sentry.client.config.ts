import * as Sentry from "@sentry/nextjs";
import { scrubErrorTelemetry } from "./lib/security/error-telemetry";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  beforeSend(event, hint) {
    hint.attachments = [];
    return scrubErrorTelemetry(event);
  },
  debug: false,
});
