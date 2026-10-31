import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // typedRoutes: true, — re-enable once all routes are defined
  images: {
    remotePatterns: [
      // Congress.gov official photos
      { protocol: "https", hostname: "bioguide.congress.gov" },
      { protocol: "https", hostname: "jjwdxjqsnwieksubkkkf.supabase.co", pathname: "/storage/v1/object/public/politician-photos/**" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
    dangerouslyAllowSVG: false,
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
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
