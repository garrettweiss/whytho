import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/server";
import { getProfile, getProfileMetadata } from "@/lib/profile/server";
import { safeJsonLd, safeWebUrl } from "@/lib/profile/helpers";
import { OwnerBanner } from "@/components/politician/owner-banner";
import { QuestionList } from "@/components/politician/question-list";
import { AskQuestionForm } from "@/components/questions/ask-question-form";
import { PeriodTabs } from "@/components/politician/period-tabs";
import { ProfileViewTracker } from "@/components/analytics/profile-view-tracker";
import { ProfilePortrait } from "@/components/profile/profile-portrait";
import { AskQuestionLink, QuestionAnchorNotice } from "@/components/profile/profile-actions";
import { faceBody, faceDisplay } from "@/components/home/fonts";
import styles from "@/components/profile/profile.module.css";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string; period?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const politician = await getProfileMetadata((await params).slug);
  if (!politician) return { title: "Politician not found | WhyTho" };
  const title = `${politician.full_name} | WhyTho`;
  const description = `Ask ${politician.full_name} a question. Support the questions you want answered and read published official responses and clearly labeled AI analysis.`;
  const images = politician.photo_url ? [politician.photo_url] : [];
  return {
    title, description,
    robots: politician.is_test ? { index: false, follow: false } : undefined,
    openGraph: { title, description, images, type: "profile" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

function formatWeek(week: number): string {
  return `Week ${week % 100}, ${Math.floor(week / 100)}`;
}

function socialLinks(value: unknown, website: string | null) {
  const handles = (value ?? {}) as Record<string, unknown>;
  const links: { label: string; href: string }[] = [];
  const networks = [
    ["X", handles.x ?? handles.twitter, "https://x.com/"],
    ["Instagram", handles.instagram, "https://instagram.com/"],
    ["Facebook", handles.facebook, "https://facebook.com/"],
    ["YouTube", handles.youtube, "https://youtube.com/@"],
    ["TikTok", handles.tiktok, "https://tiktok.com/@"],
  ];
  for (const [label, value, base] of networks) {
    if (typeof value !== "string" || typeof label !== "string") continue;
    const href = safeWebUrl(value) ?? (/^@?[A-Za-z0-9_.-]+$/.test(value) ? `${base}${encodeURIComponent(value.replace(/^@/, ""))}` : null);
    if (href) links.push({ label, href });
  }
  if (website) links.unshift({ label: "Website", href: website });
  return links;
}

export default async function PoliticianProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { week, period: requestedPeriod } = await searchParams;
  const data = await getProfile(slug, week, requestedPeriod);
  if (!data) notFound();
  const { politician, questions, period, isHistoricalView, viewingWeekNumber, currentWeekNumber } = data;
  const periodLabel = isHistoricalView ? formatWeek(viewingWeekNumber) : {
    week: `This week · ${formatWeek(currentWeekNumber)}`,
    month: "Questions from the past 28 days",
    year: "Questions from the past 365 days",
    all: "Questions from all time",
  }[period];
  const links = socialLinks(politician.social_handles, politician.website_url);
  const isCandidate = politician.is_candidate && politician.incumbent_challenge !== "I";
  const tierLabel = { "0": "Profile not yet claimed", "1": "Self-claimed profile", "2": "Verified representative", "3": "Fully verified representative" }[politician.verification_tier];
  const baseUrl = safeWebUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://whytho.us/";
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Person", name: politician.full_name,
    jobTitle: politician.office ?? undefined, url: new URL(`/${politician.slug}`, baseUrl).href,
    image: politician.photo_url ?? undefined, description: politician.bio ?? undefined,
    sameAs: links.map((link) => link.href),
  };
  const currentWeekView = !isHistoricalView && period === "week";

  return (
    <main className={`${styles.surface} ${faceBody.variable} ${faceDisplay.variable}`}>
      <ProfileViewTracker slug={politician.slug} politicianId={politician.id} office={politician.office} state={politician.state} verificationTier={politician.verification_tier} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <div className={styles.container}>
        <div className={styles.breadcrumbs}>
          <Link href="/#find-politician">← Find a politician</Link>
          <span>{politician.is_test ? "Test profile" : "The public record"}</span>
        </div>
        <OwnerBanner politicianId={politician.id} />
        {isHistoricalView && <div className={styles.notice}><p>Archive: {formatWeek(viewingWeekNumber)}. Asking and voting are closed for this week.</p><Link href={`/${slug}`}>Return to this week →</Link></div>}

        <section className={styles.hero} aria-labelledby="politician-name">
          <ProfilePortrait photoUrl={politician.photo_url} name={politician.full_name} responded={data.officialAnsweredQuestions > 0} />
          <div className={styles.identity}>
            <p className={styles.office}>{isCandidate ? "Candidate for " : ""}{politician.office ?? politician.candidate_office ?? "Public office"}{politician.state ? ` · ${politician.state}` : ""}{politician.district ? ` · District ${politician.district}` : ""}</p>
            <h1 id="politician-name">{politician.full_name}</h1>
            <p className={styles.identityLine}>{politician.party && <span>{politician.party}</span>}{!politician.is_active && <span>Inactive profile</span>}</p>
            <p className={styles.verification}>{tierLabel}</p>
            {politician.is_candidate && politician.candidate_election_year && <p className={styles.candidate}>{politician.candidate_status === "lost" ? "Candidate in" : politician.candidate_status === "withdrew" ? "Withdrew from" : politician.candidate_status === "won" ? "Won in" : "Running in"} {politician.candidate_election_year}{politician.candidate_office ? ` · ${politician.candidate_office}` : ""}{politician.incumbent_challenge === "I" ? " · Incumbent" : ""}</p>}
            <div className={styles.identityActions}>
              {currentWeekView ? <AskQuestionLink /> : <Link className={styles.primaryAction} href={`/${slug}#ask-question`}>Ask this week <span aria-hidden="true">↗</span></Link>}
              <a className={styles.secondaryAction} href="#profile-questions">Read the questions ↓</a>
            </div>
            {politician.bio && <details className={styles.about}><summary>About {politician.full_name}</summary><p>{politician.bio}</p></details>}
            {links.length > 0 && <div className={styles.externalLinks}>{links.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>}
          </div>

          <section className={styles.record} aria-labelledby="response-record">
            <div><h2 id="response-record">The response record</h2><p className={styles.recordPeriod}>{periodLabel}</p></div>
            <dl className={styles.facts}>
              <div><dt>Questions</dt><dd>{data.totalQuestions.toLocaleString("en-US")}</dd></div>
              <div className={data.officialAnsweredQuestions > 0 ? styles.official : undefined}><dt>Officially answered</dt><dd>{data.officialAnsweredQuestions.toLocaleString("en-US")}</dd></div>
            </dl>
            <div className={styles.rate}>
              <div className={styles.rateValue}>{data.responseRate === null ? "No rate yet" : `${Math.round(data.responseRate)}% answered`}</div>
              <p>{data.responseRate === null ? "No questions have reached 10 net votes in this period." : `${data.answeredQualifying} of ${data.qualifyingQuestions} questions with 10+ net votes have an official response.`}</p>
            </div>
            <details className={styles.methodology}><summary>How this is counted</summary><p>Questions are grouped by when they were submitted. The rate counts questions with at least 10 net votes that have a published response from the politician or their team. Each question counts once. AI analysis and drafts do not count. No response does not establish that a question was seen or declined. Records can take up to five minutes to refresh.</p></details>
          </section>
        </section>

        <QuestionAnchorNotice slug={slug} displayedIds={questions.map((question) => question.id)} />
        <div className={styles.mainLayout}>
          <section className={styles.questions} id="profile-questions" tabIndex={-1} aria-labelledby="questions-heading">
            <h2 id="questions-heading" className={styles.sectionTitle}>What do you want to know?</h2>
            <p className={styles.sectionIntro}>{isHistoricalView ? `Questions from ${formatWeek(viewingWeekNumber)}.` : period === "week" ? "Support the questions you want answered. Every vote helps set the agenda." : "Explore the record. Voting is open only for questions from the current week."}</p>
            {!isHistoricalView && <PeriodTabs slug={slug} activePeriod={period} />}
            {data.totalQuestions > questions.length && <p className={styles.sectionIntro}>Showing the top {questions.length} of {data.totalQuestions.toLocaleString("en-US")} questions, ranked by net votes. The response record covers the full period.</p>}
            <QuestionList questions={questions} politicianId={politician.id} politicianSlug={politician.slug} politicianName={politician.full_name} profileVerified={politician.verification_tier === "2" || politician.verification_tier === "3"} weekNumber={viewingWeekNumber} currentWeekNumber={currentWeekNumber} isHistorical={isHistoricalView} period={period} appearance="face" />
          </section>
          <aside className={styles.sidebar} aria-label="Ask and explore">
            {currentWeekView ? <AskQuestionForm politicianId={politician.id} politicianName={politician.full_name} appearance="face" /> : <p className={styles.notice}>New questions go into the current week. <Link href={`/${slug}#ask-question`}>Ask this week →</Link></p>}
            <div className={styles.help}><h2>A good question gets specific.</h2><ol><li>Ask about a decision, a commitment, or an issue they can act on.</li><li>Keep it clear and respectful.</li><li>Check the questions here first. Add your vote if someone has already asked.</li></ol></div>
            {data.archiveWeeks.length > 0 && <details className={styles.archive}><summary>Previous weeks</summary><nav aria-label="Weekly archive">{data.archiveWeeks.map((archiveWeek) => <Link key={archiveWeek} href={`/${slug}?week=${archiveWeek}#profile-questions`} aria-current={isHistoricalView && viewingWeekNumber === archiveWeek ? "page" : undefined}>{formatWeek(archiveWeek)} <span aria-hidden="true">↗</span></Link>)}</nav></details>}
            {politician.verification_tier === "0" && <p className={styles.notice}>Part of {politician.full_name}’s team? <Link href={`/verify?prefill=${politician.id}`}>Claim this profile →</Link></p>}
          </aside>
        </div>
        <footer className={styles.footer}><Link href="/#find-politician">Find another politician</Link><Link href="/how-it-works">How WhyTho works</Link><Link href="/faq">Questions about WhyTho</Link></footer>
      </div>
    </main>
  );
}

export async function generateStaticParams() {
  const { data, error } = await createPublicClient().from("politicians").select("slug")
    .eq("is_active", true).eq("is_test", false).order("id").limit(1000)
    .abortSignal(AbortSignal.timeout(8_000));
  if (error) throw new Error("Public profile paths unavailable");
  return (data ?? []).map((politician) => ({ slug: politician.slug }));
}
