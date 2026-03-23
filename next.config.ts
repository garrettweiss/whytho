import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // typedRoutes: true, — re-enable once all routes are defined
  images: {
    remotePatterns: [
      // Congress.gov official photos
      { protocol: "https", hostname: "bioguide.congress.gov" },
      // OpenStates politician photos come from many state gov / news domains
      // Tighten this list before production launch
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project — set in sentry.properties or env vars
  silent: true,

  // Upload source maps to Sentry on every build (requires SENTRY_AUTH_TOKEN)
  // Get token: sentry.io → Settings → Auth Tokens → project:write scope
  // Set in Vercel: Settings → Environment Variables → SENTRY_AUTH_TOKEN
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Disable Sentry CLI telemetry
  telemetry: false,

  // Tree-shake Sentry logger in production to reduce bundle size
  disableLogger: true,
});
