import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture 100% of sessions with errors
  replaysOnErrorSampleRate: 1.0,

  // Capture 1% of all sessions for Session Replay
  replaysSessionSampleRate: 0.01,

  // Don't log to console in production
  debug: process.env.NODE_ENV === "development",
});
