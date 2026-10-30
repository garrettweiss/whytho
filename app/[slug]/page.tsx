import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { OwnerBanner } from "@/components/politician/owner-banner";
import { PoliticianHeader } from "@/components/politician/politician-header";
import { ParticipationRate } from "@/components/politician/participation-rate";
import { QuestionList } from "@/components/politician/question-list";
import { AskQuestionForm } from "@/components/questions/ask-question-form";
import { PeriodTabs, type Period } from "@/components/politician/period-tabs";
import { ProfileViewTracker } from "@/components/analytics/profile-view-tracker";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string; period?: string }>;
}

/**
 * Metadata lookup, cached alongside the page data. generateMetadata runs on
 * every request to a dynamic page, and this was the one profile query left
 * outside the cache: on the nano instance it cost 1 to 3 seconds per view.
 */
const loadProfileMetadata = unstable_cache(
  async (slug: string) => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("politicians")
      .select("full_name, office, state, party, photo_url, bio, is_test")
      .eq("slug", slug)
      .single();
    return data ?? null;
  },
  ["politician-profile-metadata"],
  { revalidate: 300, tags: ["politician-profile"] }
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const politician = await loadProfileMetadata(slug);

  if (!politician) return { title: "Politician Not Found | WhyTho" };

  const title = `${politician.full_name} | WhyTho`;
  const description = `Ask ${politician.full_name} (${politician.office}) a question. See their response rate and track whether they answer. Silence is its own answer.`;

  return {
    title,
    description,
    // Test fixtures are reachable by direct URL for QA but must never be indexed.
    robots: politician.is_test ? { index: false, follow: false } : undefined,
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

/**
 * All profile data, cached per (slug, week, period).
 *
 * This page reads searchParams, which forces dynamic rendering in Next 15, so
 * ISR cannot cache the HTML. Caching the data layer instead means the database
 * answers one query set per profile per window rather than one per visitor.
 * With 11,513 profiles crawled continuously on a nano instance, that difference
 * is what exhausted the Disk IO budget in August 2026.
 *
 * Must stay free of cookies() and headers(): unstable_cache forbids them, and
 * the point is that the result is identical for every visitor.
 */
const loadProfile = unstable_cache(
  async (slug: string, weekParam: string | undefined, periodParam: string | undefined) => {
  const supabase = createPublicClient();

  const { data: politician } = await supabase
    .from("politicians")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!politician) return null;


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
      source,
      status,
      submitted_by,
      created_at,
      week_number,
      x_posts:x_post_id (
        author_handle,
        author_name,
        tweet_url
      ),
      answers (
        id,
        answer_type,
        body,
        is_ai_generated,
        ai_confidence,
        sources,
        is_disputed,
        created_at,
        answer_media (
          id,
          media_type,
          public_url,
          file_name
        )
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
    // month / year / all - filter by created_at date range
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

  return {
    politician,
    currentWeekNumber,
    isHistoricalView,
    viewingWeekNumber,
    period,
    questions: questions ?? [],
    participationRate,
    snapshots: snapshots ?? [],
  };
  },
  ["politician-profile"],
  { revalidate: 300, tags: ["politician-profile"] }
);

export default async function PoliticianProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { week: weekParam, period: periodParam } = await searchParams;

  const data = await loadProfile(slug, weekParam, periodParam);
  if (!data) notFound();
  const {
    politician,
    currentWeekNumber,
    isHistoricalView,
    viewingWeekNumber,
    period,
    questions,
    participationRate,
    snapshots,
  } = data;

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://whytho.us";
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
      <ProfileViewTracker
        slug={politician.slug}
        politicianId={politician.id}
        office={politician.office ?? null}
        state={politician.state ?? null}
        verificationTier={politician.verification_tier}
      />
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
                📅 Viewing archive: {formatWeekNumber(viewingWeekNumber)}
              </p>
              <Link
                href={`/${politician.slug}`}
                className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:no-underline shrink-0"
              >
                → Current week
              </Link>
            </div>
          )}

          {/* Owner banner, resolved client-side so this page stays cacheable */}
          <OwnerBanner politicianId={politician.id} />

          {/* Unclaimed prompt. A tier-0 profile has no team yet, so no owner check is needed. */}
          {politician.verification_tier === "0" && (
            <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                This profile is unclaimed. Are you {politician.full_name}?
              </p>
              <Link
                href={`/verify?prefill=${politician.id}`}
                className="shrink-0 text-sm font-medium underline underline-offset-2 hover:no-underline"
              >
                Claim this profile →
              </Link>
            </div>
          )}

          {/* Candidate badge - shown when running in an upcoming election */}
          {politician.is_candidate && politician.candidate_election_year && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-3">
              <span className="text-base">🗳️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Running for {politician.candidate_office ?? "office"} · {politician.candidate_election_year}
                  {politician.incumbent_challenge === "I" && (
                    <span className="ml-2 text-xs font-normal opacity-75">(Incumbent)</span>
                  )}
                  {politician.incumbent_challenge === "O" && (
                    <span className="ml-2 text-xs font-normal opacity-75">(Open seat)</span>
                  )}
                </p>
              </div>
            </div>
          )}

          <PoliticianHeader
            politician={politician}
            currentParticipationRate={participationRate}
          />

          {/* Social links */}
          {(() => {
            const handles = (politician.social_handles ?? {}) as Record<string, string>;
            const links: { label: string; href: string }[] = [];
            if (handles.x || handles.twitter) {
              links.push({ label: "X", href: `https://x.com/${handles.x ?? handles.twitter}` });
            }
            if (handles.instagram) {
              links.push({ label: "Instagram", href: `https://instagram.com/${handles.instagram}` });
            }
            if (handles.facebook) {
              const fb = handles.facebook;
              links.push({ label: "Facebook", href: fb.startsWith("http") ? fb : `https://facebook.com/${fb}` });
            }
            if (handles.tiktok) {
              links.push({ label: "TikTok", href: `https://tiktok.com/@${handles.tiktok}` });
            }
            if (politician.website_url) {
              links.push({ label: "Website", href: politician.website_url });
            }
            if (links.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {l.label} ↗
                  </a>
                ))}
              </div>
            );
          })()}

          <ParticipationRate
            currentRate={participationRate}
            snapshots={snapshots ?? []}
            weekNumber={viewingWeekNumber}
            politicianSlug={politician.slug}
            period={period}
            isHistoricalView={isHistoricalView}
          />

          {/* Period tabs - hidden in legacy archive view */}
          {!isHistoricalView && (
            <Suspense>
              <PeriodTabs slug={politician.slug} activePeriod={period} />
            </Suspense>
          )}

          {/* Ask form - only on current week tab */}
          {!isHistoricalView && period === "week" && (
            <AskQuestionForm
              politicianId={politician.id}
              politicianName={politician.full_name}
            />
          )}

          <QuestionList
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            questions={(questions ?? []) as any}
            politicianId={politician.id}
            politicianSlug={politician.slug}
            politicianName={politician.full_name}
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

// Static generation for top politicians - rest are dynamic
export async function generateStaticParams() {
  const { createAdminClient } = await import("@/lib/supabase/server");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("politicians")
    .select("slug")
    .eq("is_active", true)
    .eq("is_test", false)
    .limit(1000);

  return (data ?? []).map((p) => ({ slug: p.slug }));
}
