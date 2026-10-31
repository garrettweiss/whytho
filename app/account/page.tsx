import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AccountProfileForm } from "@/components/account/account-profile-form";
import { PublicPage } from "@/components/public/public-layout";
import publicStyles from "@/components/public/public.module.css";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = { title: "My Account | WhyTho", robots: { index: false, follow: false } };
interface Props { searchParams: Promise<{ tab?: string | string[] }> }
type Tab = "questions" | "votes" | "profile";

function formatWeekLabel(weekNumber: number): string {
  return `Week ${weekNumber % 100}, ${Math.floor(weekNumber / 100)}`;
}
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function AccountReadError({ tab }: { tab: Tab }) {
  return <section className={publicStyles.empty} role="alert">
    <h2>This part of your account could not load.</h2>
    <p>Your records could not be retrieved. This does not mean your history is empty.</p>
    <Link href={`/account?tab=${tab}`}>Reload this section</Link>
  </section>;
}

export default async function AccountPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const activeTab: Tab = tab === "votes" ? "votes" : tab === "profile" ? "profile" : "questions";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect(`/sign-in?redirect=${encodeURIComponent(`/account?tab=${activeTab}`)}`);

  // Account reads stay authenticated, user-scoped, and outside public caches.
  const [questionResult, voteResult, profileResult] = await Promise.all([
    supabase.from("questions").select("id, body, net_upvotes, week_number, status, created_at, politicians ( full_name, slug )")
      .eq("submitted_by", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("votes").select("id, value, week_number, created_at, questions ( id, body, net_upvotes, week_number, politicians ( full_name, slug ) )")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("user_profiles").select("city, county, state_code, political_affiliation").eq("id", user.id).maybeSingle(),
  ]);
  const questions = questionResult.data ?? [];
  const votes = voteResult.data ?? [];
  const profile = profileResult.data;

  return <PublicPage title="Your voice. Your record." kicker="My account" description="Return to the questions you asked, the ones you voted on, and your profile.">
    {user.email && <p className={styles.accountIdentity}>Signed in as {user.email}</p>}
    <nav className={publicStyles.tabs} aria-label="Account sections">
      <Link href="/account?tab=questions" aria-current={activeTab === "questions" ? "page" : undefined}>My questions</Link>
      <Link href="/account?tab=votes" aria-current={activeTab === "votes" ? "page" : undefined}>My votes</Link>
      <Link href="/account?tab=profile" aria-current={activeTab === "profile" ? "page" : undefined}>Profile</Link>
    </nav>

    {activeTab === "questions" && (questionResult.error ? <AccountReadError tab="questions" /> : <section aria-labelledby="my-questions-heading">
      <div className={styles.historyHeader}><h2 id="my-questions-heading">Your recent questions.</h2><p>Up to 50 of your most recent questions.</p></div>
      {questions.length === 0 ? <div className={publicStyles.empty}><h2>Your first question starts here.</h2><p>Questions you submit to politicians will appear in your account.</p><Link href="/#find-politician">Find someone to ask</Link></div> : <div className={styles.history}>
        {questions.map((question) => {
          const politician = Array.isArray(question.politicians) ? question.politicians[0] : question.politicians;
          return <article key={question.id} className={styles.historyRow}>
            <div><p className={styles.historyBody}>{question.body}</p><div className={styles.historyMeta}>
              {politician?.slug ? <Link href={`/${politician.slug}`}>{politician.full_name}</Link> : <span>Politician profile unavailable</span>}
              <span>{formatWeekLabel(question.week_number)}</span><span>{formatDate(question.created_at)}</span>
              {question.status === "removed" && <span>Question removed</span>}{question.status === "merged" && <span>Question merged</span>}
            </div></div>
            <div className={styles.historyAside}><strong>{question.net_upvotes > 0 ? "+" : ""}{question.net_upvotes}</strong><span>net votes</span></div>
          </article>;
        })}
      </div>}
    </section>)}

    {activeTab === "votes" && (voteResult.error ? <AccountReadError tab="votes" /> : <section aria-labelledby="my-votes-heading">
      <div className={styles.historyHeader}><h2 id="my-votes-heading">Your recent votes.</h2><p>Up to 100 of your most recent votes.</p></div>
      {votes.length === 0 ? <div className={publicStyles.empty}><h2>Good questions deserve support.</h2><p>Questions you vote on will appear here.</p><Link href="/#find-politician">Explore the questions</Link></div> : <div className={styles.history}>
        {votes.map((vote) => {
          const question = Array.isArray(vote.questions) ? vote.questions[0] : vote.questions;
          const politician = question ? (Array.isArray(question.politicians) ? question.politicians[0] : question.politicians) : null;
          const isUp = vote.value > 0;
          return <article key={vote.id} className={styles.historyRow}>
            <div><p className={styles.historyBody}>{question?.body ?? "Question details are unavailable."}</p><div className={styles.historyMeta}>
              {politician?.slug ? <Link href={`/${politician.slug}`}>{politician.full_name}</Link> : <span>Politician profile unavailable</span>}
              <span>{formatWeekLabel(question?.week_number ?? vote.week_number)}</span><span>{formatDate(vote.created_at)}</span>
            </div></div>
            <span className={styles.voteDirection}><span aria-hidden="true">{isUp ? "↑" : "↓"}</span>{isUp ? "Upvoted" : "Downvoted"}</span>
          </article>;
        })}
      </div>}
    </section>)}

    {activeTab === "profile" && (profileResult.error ? <AccountReadError tab="profile" /> : <AccountProfileForm initialCity={profile?.city ?? null} initialCounty={profile?.county ?? null} initialStateCode={profile?.state_code ?? null} initialAffiliation={profile?.political_affiliation ?? null} />)}
  </PublicPage>;
}
