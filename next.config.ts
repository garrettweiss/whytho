import type { NextConfig } from "next";

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

export default nextConfig;
