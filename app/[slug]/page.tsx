import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PoliticianHeader } from "@/components/politician/politician-header";
import { ParticipationRate } from "@/components/politician/participation-rate";
import { QuestionList } from "@/components/politician/question-list";
import { AskQuestionForm } from "@/components/questions/ask-question-form";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: politician } = await supabase
    .from("politicians")
    .select("full_name, office, state, party, photo_url, bio")
    .eq("slug", slug)
    .single();

  if (!politician) return { title: "Politician Not Found — WhyTho" };

  const title = `${politician.full_name} — WhyTho`;
  const description = `Ask ${politician.full_name} (${politician.office}) a question. See their response rate and track whether they answer. Silence is its own answer.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: politician.photo_url ? [politician.photo_url] : [],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: politician.photo_url ? [politician.photo_url] : [],
    },
  };
}

/** Format YYYYWW → "Week 11, 2026" */
function formatWeekNumber(weekNum: number): string {
  const year = Math.floor(weekNum / 100);
  const week = weekNum % 100;
  return `Week ${week}, ${year}`;
}

export default async function PoliticianProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { week: weekParam } = await searchParams;
  const supabase = await createClient();

  const { data: politician } = await supabase
    .from("politicians")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!politician) notFound();

  // Current week number
  const { data: weekData } = await supabase.rpc("current_week_number");
  const currentWeekNumber = weekData as number;

  // Determine which week we're viewing
  const parsedWeekParam = weekParam ? parseInt(weekParam, 10) : NaN;
  const isHistoricalView =
    !isNaN(parsedWeekParam) &&
    parsedWeekParam > 202000 && // sanity check: after year 2020
    parsedWeekParam < currentWeekNumber;

  const viewingWeekNumber = isHistoricalView ? parsedWeekParam : currentWeekNumber;

  // Questions for the viewed week
  const { data: questions } = await supabase
    .from("questions")
    .select(`
      id,
      body,
      net_upvotes,
      is_seeded,
      status,
      submitted_by,
      created_at,
      week_number,
      answers (
        id,
        answer_type,
        body,
        is_ai_generated,
        ai_confidence,
        sources,
        is_disputed,
        created_at
      )
    `)
    .eq("politician_id", politician.id)
    .eq("week_number", viewingWeekNumber)
    .eq("status", "active")
    .order("net_upvotes", { ascending: false })
    .limit(50);

  // Participation rate for viewed week
  const { data: participationRate } = await supabase.rpc("participation_rate", {
    p_politician_id: politician.id,
    p_week_number: viewingWeekNumber,
  });

  // Recent weekly snapshots (last 8 weeks for sparkline)
  const { data: snapshots } = await supabase
    .from("weekly_snapshots")
    .select("week_number, participation_rate, answered_qualifying, qualifying_questions")
    .eq("politician_id", politician.id)
    .order("week_number", { ascending: false })
    .limit(8);

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://whytho-alpha.vercel.app";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: politician.full_name,
    jobTitle: politician.office ?? undefined,
    url: `${BASE_URL}/${politician.slug}`,
    image: politician.photo_url ?? undefined,
    description: politician.bio ?? undefined,
    sameAs: (() => {
      const handles = (politician.social_handles ?? {}) as Record<string, string>;
      return [
        handles.twitter ? `https://twitter.com/${handles.twitter}` : null,
        politician.website_url ?? null,
      ].filter(Boolean);
    })(),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">

          {/* Historical week banner */}
          {isHistoricalView && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                📅 Viewing archive — {formatWeekNumber(viewingWeekNumber)}
              </p>
              <Link
                href={`/${politician.slug}`}
                className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:no-underline shrink-0"
              >
                → Current week
              </Link>
            </div>
          )}

          <PoliticianHeader
            politician={politician}
            currentParticipationRate={participationRate as number | null}
          />

          <ParticipationRate
            currentRate={participationRate as number | null}
            snapshots={snapshots ?? []}
            weekNumber={viewingWeekNumber}
            politicianSlug={politician.slug}
          />

          {/* Only show ask form on the current week — can't submit to past weeks */}
          {!isHistoricalView && (
            <AskQuestionForm
              politicianId={politician.id}
              politicianName={politician.full_name}
            />
          )}

          <QuestionList
            questions={questions ?? []}
            politicianId={politician.id}
            weekNumber={viewingWeekNumber}
            isHistorical={isHistoricalView}
          />

        </div>
      </div>
    </>
  );
}

// Static generation for top politicians — rest are dynamic
export async function generateStaticParams() {
  const { createAdminClient } = await import("@/lib/supabase/server");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("politicians")
    .select("slug")
    .eq("is_active", true)
    .limit(1000);

  return (data ?? []).map((p) => ({ slug: p.slug }));
}
