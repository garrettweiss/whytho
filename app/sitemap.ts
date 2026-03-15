import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://whytho-alpha.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/federal`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...["ca", "tx", "fl", "ny", "pa", "oh", "ga", "nc", "mi", "az"].map((code) => ({
      url: `${BASE_URL}/state/${code}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  // Politician profile pages
  const supabase = createAdminClient();
  const { data: politicians } = await supabase
    .from("politicians")
    .select("slug, updated_at")
    .eq("is_active", true)
    .limit(2000);

  const politicianPages: MetadataRoute.Sitemap = (politicians ?? []).map((p) => ({
    url: `${BASE_URL}/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...politicianPages];
}
