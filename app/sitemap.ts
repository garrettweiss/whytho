import { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/server";

export const revalidate = 300;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://whytho.us";

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
    ...["privacy", "terms", "report"].map((slug) => ({
      url: `${BASE_URL}/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...["ca", "tx", "fl", "ny", "pa", "oh", "ga", "nc", "mi", "az"].map((code) => ({
      url: `${BASE_URL}/state/${code}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  // Politician profile pages
  const supabase = createPublicClient();
  const politicians = [];
  const signal = AbortSignal.timeout(20000);
  let after: string | null = null;
  for (;;) {
    let query = supabase.from("politicians").select("id,slug,updated_at")
      .eq("is_active", true).eq("is_test", false).is("canonical_politician_id", null)
      .order("id").limit(500);
    if (after) query = query.gt("id", after);
    const page = await query.abortSignal(signal);
    if (page.error || !page.data) throw new Error("Sitemap identities unavailable");
    politicians.push(...page.data);
    if (page.data.length < 500) break;
    const next = page.data.at(-1)!.id;
    if (after && next <= after) throw new Error("Sitemap pagination did not advance");
    after = next;
  }

  const politicianPages: MetadataRoute.Sitemap = (politicians ?? []).map((p) => ({
    url: `${BASE_URL}/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...politicianPages];
}
