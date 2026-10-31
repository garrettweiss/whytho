import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TeamManager } from "@/components/dashboard/team-manager";
import { ProfileEditor } from "@/components/dashboard/profile-editor";
import { DisconnectButton } from "@/components/dashboard/disconnect-button";
import { DraftApproveButton } from "@/components/dashboard/draft-approve-button";
import { DashboardQuestionInbox } from "@/components/dashboard/question-inbox";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AnswerMediaDisplay } from "@/components/answers/answer-media-display";
import { safeAnswerMediaUrl } from "@/components/answers/media-url";
import { isValidIsoWeek, safeWebUrl } from "@/lib/profile/helpers";
import styles from "@/components/dashboard/dashboard.module.css";

export const metadata: Metadata = {
  title: "Politician Dashboard | WhyTho",
  description: "Manage your WhyTho profile and respond to constituent questions.",
};

type QuestionRow = {
  id: string;
  body: string;
  net_upvotes: number;
  week_number: number;
  created_at: string;
  is_seeded: boolean;
  answers: {
    id: string;
    answer_type: string;
    body: string;
    is_ai_generated: boolean;
    is_draft: boolean;
    created_at: string;
  }[];
};

type DraftRow = {
  id: string;
  body: string;
  created_at: string;
  question_id: string;
  question_body: string;
  media: { id: string; media_type: "image" | "video" | "audio"; public_url: string; file_name: string | null }[];
};

const NEW_QUESTION_HOURS = 48;

function TierBadge({ tier }: { tier: string }) {
  const labels: Record<string, string> = { "0": "Unclaimed", "1": "Self-claimed", "2": "Verified", "3": "Fully verified" };
  return <span className={`${styles.badge} ${Number(tier) >= 2 ? styles.verified : ""}`}>{labels[tier] ?? labels["0"]}</span>;
}

function DashboardUnavailable() {
  return <DashboardShell><section className={styles.empty}>
    <h2>Dashboard unavailable.</h2>
    <p>We could not load your profile information. Your saved work has not changed.</p>
    {/* A full reload retries failed server reads instead of reusing the current route payload. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a href="/dashboard" className={styles.secondaryButton}>Try again</a>
  </section></DashboardShell>;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    redirect("/sign-in?redirect=/dashboard");
  }

  // Respect the view mode toggle — citizens (or politicians in citizen mode) cannot access dashboard
  const cookieStore = await cookies();
  const viewMode = cookieStore.get("whytho-view-mode")?.value;
  if (viewMode === "citizen") {
    redirect("/");
  }

  const { data: weekData, error: weekError } = await supabase.rpc("current_week_number").abortSignal(AbortSignal.timeout(8_000));
  if (weekError || typeof weekData !== "number" || !isValidIsoWeek(weekData)) return <DashboardUnavailable />;
  const currentWeekNumber = weekData;

  const { data: memberships, error: membershipError } = await supabase
    .from("politician_team")
    .select(`
      role,
      politicians (
        id,
        slug,
        full_name,
        office,
        state,
        party,
        photo_url,
        website_url,
        bio,
        verification_tier,
        social_handles
      )
    `)
    .eq("user_id", user.id).abortSignal(AbortSignal.timeout(8_000));

  if (membershipError) return <DashboardUnavailable />;

  if (!memberships || memberships.length === 0) {
    return <DashboardShell>
      <section className={styles.empty}>
        <h2>Put your name on the record.</h2>
        <p>You have not claimed a politician profile yet. Claim yours to respond to questions and manage your team.</p>
        <Link href="/verify" className={styles.button}>Claim your profile <span aria-hidden="true">→</span></Link>
      </section>
    </DashboardShell>;
  }

  const cutoff48h = new Date(Date.now() - NEW_QUESTION_HOURS * 60 * 60 * 1000).toISOString();

  type PoliticianWithData = {
    politician: {
      id: string;
      slug: string;
      full_name: string;
      office: string | null;
      state: string | null;
      party: string | null;
      photo_url: string | null;
      website_url: string | null;
      bio: string | null;
      verification_tier: string;
      social_handles: Record<string, string> | null;
    };
    role: string;
    isOnlyAdmin: boolean;
    questions: QuestionRow[];
    drafts: DraftRow[];
    pendingDrafts: number;
    stats: { totalQuestions: number; totalAnswers: number; thisWeekQuestions: number };
  };

  const politiciansData: PoliticianWithData[] = [];

  for (const membership of memberships) {
    const politician = Array.isArray(membership.politicians)
      ? membership.politicians[0]
      : membership.politicians;
    if (!politician) continue;

    const readSignal = AbortSignal.timeout(8_000);
    const [
      { data: questions, error: questionsError },
      { count: totalQuestions, error: totalQuestionsError },
      { count: totalAnswers, error: totalAnswersError },
      { count: thisWeekQuestions, error: thisWeekError },
      { data: rawDrafts, count: pendingDrafts, error: draftsError },
      { count: adminCount, error: adminError },
    ] = await Promise.all([
      supabase
        .from("questions")
        .select(`id, body, net_upvotes, week_number, created_at, is_seeded, answers ( id, answer_type, body, is_ai_generated, is_draft, created_at )`)
        .eq("politician_id", politician.id)
        .eq("week_number", currentWeekNumber)
        .eq("status", "active")
        .eq("answers.is_draft", false)
        .order("net_upvotes", { ascending: false })
        .order("id", { ascending: true })
        .limit(100).abortSignal(readSignal),
      supabase.from("questions").select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id).eq("status", "active").abortSignal(readSignal),
      supabase.from("answers").select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id).eq("is_ai_generated", false).eq("is_draft", false)
        .in("answer_type", ["direct", "team_statement"]).abortSignal(readSignal),
      supabase.from("questions").select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id).eq("week_number", currentWeekNumber).eq("status", "active").abortSignal(readSignal),
      // Fetch pending drafts (only relevant for admin/editor roles)
      ["admin", "editor"].includes(membership.role)
        ? supabase
            .from("answers")
            .select(`id, body, created_at, question_id, questions ( body ), answer_media ( id, media_type, public_url, file_name )`, { count: "exact" })
            .eq("politician_id", politician.id)
            .eq("is_draft", true)
            .eq("is_ai_generated", false)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(1000).abortSignal(readSignal)
        : Promise.resolve({ data: [], count: 0, error: null }),
      // Count admins to determine if caller is the only one
      supabase
        .from("politician_team")
        .select("*", { count: "exact", head: true })
        .eq("politician_id", politician.id)
        .eq("role", "admin").abortSignal(readSignal),
    ]);

    if (questionsError || totalQuestionsError || totalAnswersError || thisWeekError || draftsError || adminError ||
      !questions || !rawDrafts || totalQuestions === null || totalAnswers === null || thisWeekQuestions === null || pendingDrafts === null || adminCount === null) return <DashboardUnavailable />;

    // Normalize rawDrafts (questions is a joined object)
    const drafts: DraftRow[] = (rawDrafts ?? []).map((d) => {
      const q = Array.isArray(d.questions) ? d.questions[0] : d.questions;
      return {
        id: d.id,
        body: d.body,
        created_at: d.created_at,
        question_id: d.question_id,
        question_body: (q as { body: string } | null)?.body ?? "",
        media: (d.answer_media ?? []).flatMap((media): DraftRow["media"] => {
          const url = safeAnswerMediaUrl(media.public_url);
          if (!url || !["image", "video", "audio"].includes(media.media_type)) return [];
          return [{ id: media.id, media_type: media.media_type as "image" | "video" | "audio", public_url: url, file_name: media.file_name }];
        }),
      };
    });

    politiciansData.push({
      politician,
      role: membership.role,
      isOnlyAdmin: membership.role === "admin" && (adminCount ?? 0) <= 1,
      questions: (questions ?? []) as QuestionRow[],
      drafts,
      pendingDrafts,
      stats: {
        totalQuestions: totalQuestions ?? 0,
        totalAnswers: totalAnswers ?? 0,
        thisWeekQuestions: thisWeekQuestions ?? 0,
      },
    });
  }

  return <DashboardShell>
    {politiciansData.map(({ politician, role, isOnlyAdmin, questions, drafts, pendingDrafts, stats }) => {
      const photoUrl = safeWebUrl(politician.photo_url);
      const profileVerified = ["2", "3"].includes(politician.verification_tier);
      const canPublish = profileVerified && ["admin", "editor"].includes(role);
      return <section key={politician.id} className={styles.politician} aria-labelledby={`name-${politician.id}`}>
        <header className={styles.profileHeader}>
          <div className={styles.portrait}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" loading="lazy" />
            ) : politician.full_name.slice(0, 1).toUpperCase()}
          </div>
          <div className={styles.profileIdentity}>
            <div className={styles.badgeRow}><TierBadge tier={politician.verification_tier} /><span className={styles.eyebrow}>{role} access</span></div>
            <h2 id={`name-${politician.id}`}><Link href={`/${politician.slug}`}>{politician.full_name}</Link></h2>
            <p className={styles.identityMeta}>{[politician.office, politician.state, politician.party].filter(Boolean).join(" · ")}</p>
          </div>
          <Link href={!profileVerified ? `/verify?prefill=${politician.id}` : `/${politician.slug}`} className={styles.secondaryButton}>
            {!profileVerified ? "Verify your identity" : "View public profile"} <span aria-hidden="true">↗</span>
          </Link>
        </header>
        {!profileVerified && <p className={styles.meta}>Complete identity verification before publishing official responses. You can prepare private drafts now.</p>}

        <dl className={styles.summary}>
          <div className={styles.stat}><dd><strong>{stats.thisWeekQuestions}</strong></dd><dt>active questions this week</dt></div>
          <div className={styles.stat}><dd><strong>{stats.totalQuestions}</strong></dd><dt>active questions across all weeks</dt></div>
          <div className={styles.stat}><dd><strong>{stats.totalAnswers}</strong></dd><dt>published official responses, all time</dt></div>
        </dl>
        <nav className={styles.sectionNav} aria-label={`${politician.full_name} dashboard sections`}>
          <a href={`#inbox-${politician.id}`}>Questions & drafts</a>
          <a href={`#settings-${politician.id}`}>Profile & team</a>
          <Link href={`/${politician.slug}`}>Public response record ↗</Link>
        </nav>

        <div className={styles.workspace}>
          <section className={styles.inbox} id={`inbox-${politician.id}`} aria-label="Questions and drafts">
            {["admin", "editor"].includes(role) && drafts.length > 0 && <section className={styles.draftQueue} aria-label="Drafts awaiting approval">
              <p className={styles.eyebrow}>{profileVerified ? "Review before publishing" : "Private until verified"}</p>
              <h3>{pendingDrafts} private draft response{pendingDrafts !== 1 ? "s" : ""}</h3>
              {pendingDrafts > drafts.length && <p className={styles.meta}>Showing the oldest {drafts.length} drafts. Publishing a draft makes room for the next one after refreshing.</p>}
              <p className={styles.meta}>Only responses approved by an admin or editor of a verified profile appear publicly.</p>
              {!profileVerified && <Link href={`/verify?prefill=${politician.id}`} className={styles.secondaryButton}>Verify identity to publish</Link>}
              {drafts.map(draft => <article key={draft.id} className={styles.draft}>
                <p className={styles.eyebrow}>Question</p>
                <p className={styles.draftBody}>{draft.question_body}</p>
                <p className={styles.eyebrow}>Draft response</p>
                <p className={styles.draftBody}>{draft.body}</p>
                {draft.media.length > 0 && <div><p className={styles.meta}>Private attachments. Approval publishes these with the response.</p><AnswerMediaDisplay media={draft.media} /></div>}
                {canPublish && <DraftApproveButton answerId={draft.id} />}
              </article>)}
            </section>}
            <DashboardQuestionInbox questions={questions} totalQuestions={stats.thisWeekQuestions} role={role} profileVerified={profileVerified} politicianSlug={politician.slug} politicianName={politician.full_name} cutoff48h={cutoff48h} />
          </section>
          <aside className={styles.settings} id={`settings-${politician.id}`} aria-label={`${politician.full_name} profile and team settings`}>
            <h3 className={styles.sectionTitle}>Profile & team</h3>
            <p className={styles.meta}>Your access: {role}. Changes here apply to {politician.full_name}.</p>
            {role === "admin" && <ProfileEditor politicianId={politician.id} currentWebsiteUrl={politician.website_url} currentBio={politician.bio} currentSocialHandles={politician.social_handles as Record<string, string> | null} />}
            <TeamManager politicianId={politician.id} callerRole={role} />
            {role === "admin" && <div className={styles.panel}><DisconnectButton politicianId={politician.id} politicianName={politician.full_name} isOnlyAdmin={isOnlyAdmin} /></div>}
          </aside>
        </div>
      </section>;
    })}
  </DashboardShell>;
}
