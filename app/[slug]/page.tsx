import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PoliticianHeader } from "@/components/politician/politician-header";
import { ParticipationRate } from "@/components/politician/participation-rate";
import { QuestionList } from "@/components/politician/question-list";
import { AskQuestionForm } from "@/components/questions/ask-question-form";
import { PeriodTabs, type Period } from "@/components/politician/period-tabs";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string; period?: string }>;
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

/** ISO date cutoff string for period-based queries */
function periodCutoff(period: Period): string | null {
  switch (period) {
    case "month": return new Date(Date.now() - 28  * 24 * 60 * 60 * 1000).toISOString();
    case "year":  return new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    default:      return null; // week uses week_number; all has no filter
  }
}

const VALID_PERIODS: Period[] = ["week", "month", "year", "all"];

export default async function PoliticianProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { week: weekParam, period: periodParam } = await searchParams;
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

  // ── Legacy archive view (?week=202611) ───────────────────────────────────
  // Only active when ?week= is present AND no ?period= param
  const parsedWeekParam = weekParam ? parseInt(weekParam, 10) : NaN;
  const isHistoricalView =
    !periodParam &&
    !isNaN(parsedWeekParam) &&
    parsedWeekParam > 202000 &&
    parsedWeekParam < currentWeekNumber;

  const viewingWeekNumber = isHistoricalView ? parsedWeekParam : currentWeekNumber;

  // ── Period tab ───────────────────────────────────────────────────────────
  const period: Period = isHistoricalView
    ? "week"
    : VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "week";

  // ── Questions query ──────────────────────────────────────────────────────
  let questionsQuery = supabase
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
    .eq("status", "active")
    .order("net_upvotes", { ascending: false });

  if (isHistoricalView) {
    // Legacy archive: a specific past week
    questionsQuery = questionsQuery.eq("week_number", viewingWeekNumber).limit(50);
  } else if (period === "week") {
    questionsQuery = questionsQuery.eq("week_number", currentWeekNumber).limit(50);
  } else {
    // month / year / all — filter by created_at date range
    const cutoff = periodCutoff(period);
    if (cutoff) {
      questionsQuery = questionsQuery.gte("created_at", cutoff);
    }
    // "all" has no additional filter
    questionsQuery = questionsQuery.limit(200);
  }

  const { data: questions } = await questionsQuery;

  // ── Participation rate ────────────────────────────────────────────────────
  let participationRate: number | null = null;
  if (isHistoricalView) {
    // Legacy archive: use old per-week RPC (net_upvotes >= 10 threshold)
    const { data } = await supabase.rpc("participation_rate", {
      p_politician_id: politician.id,
      p_week_number: viewingWeekNumber,
    });
    participationRate = data as number | null;
  } else {
    // New period-aware RPC: min(actual_count, N) denominator
    const { data } = await supabase.rpc("participation_rate_period", {
      p_politician_id: politician.id,
      p_period: period,
    });
    participationRate = data as number | null;
  }

  // ── Weekly snapshots (sparkline + history mini-table) ────────────────────
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
            currentParticipationRate={participationRate}
          />

          <ParticipationRate
            currentRate={participationRate}
            snapshots={snapshots ?? []}
            weekNumber={viewingWeekNumber}
            politicianSlug={politician.slug}
            period={period}
            isHistoricalView={isHistoricalView}
          />

          {/* Period tabs — hidden in legacy archive view */}
          {!isHistoricalView && (
            <Suspense>
              <PeriodTabs slug={politician.slug} activePeriod={period} />
            </Suspense>
          )}

          {/* Ask form — only on current week tab */}
          {!isHistoricalView && period === "week" && (
            <AskQuestionForm
              politicianId={politician.id}
              politicianName={politician.full_name}
            />
          )}

          <QuestionList
            questions={questions ?? []}
            politicianId={politician.id}
            weekNumber={viewingWeekNumber}
            currentWeekNumber={currentWeekNumber}
            isHistorical={isHistoricalView}
            period={period}
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
