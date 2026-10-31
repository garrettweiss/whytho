import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage, PublicPersonLink } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
import { getLeaderboard } from "@/lib/leaderboard/server";
import { leaderboardDisplayPage, LEADERBOARD_DISPLAY_PAGE_SIZE } from "@/lib/leaderboard/ranking";

export const metadata: Metadata = {
  title: "Official Response Leaderboard | WhyTho",
  description: "Compare official responses to this week's qualifying questions. Published politician and team answers only.",
};

// Search parameters paginate the display; the complete ranking has its own cache.
export const revalidate = 300;

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [data, params] = await Promise.all([getLeaderboard(), searchParams]);
  const page = leaderboardDisplayPage(typeof params.page === "string" ? params.page : undefined, data.entries.length);
  const pageCount = Math.max(1, Math.ceil(data.entries.length / LEADERBOARD_DISPLAY_PAGE_SIZE));
  const start = (page - 1) * LEADERBOARD_DISPLAY_PAGE_SIZE;
  const visible = data.entries.slice(start, start + LEADERBOARD_DISPLAY_PAGE_SIZE);
  const weekLabel = `Week ${data.weekNumber % 100}, ${Math.floor(data.weekNumber / 100)}`;
  const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const updated = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(data.generatedAt));

  return <PublicPage title="Who's answering?" description={`${weekLabel}. Ranked by official responses to questions with at least 10 net upvotes.`}
    action={<Link href="/#find-politician" className={styles.button}>Find a politician <span aria-hidden="true">↗</span></Link>}>
    <div className={styles.summary} aria-label="This week's qualifying record">
      <div className={styles.stat}><strong>{data.entries.length.toLocaleString("en-US")}</strong>politicians with qualifying questions</div>
      <div className={styles.stat}><strong>{data.totalQualifyingQuestions.toLocaleString("en-US")}</strong>qualifying questions</div>
      <div className={styles.stat}><strong>{data.totalAnsweredQuestions.toLocaleString("en-US")}</strong>with an official response</div>
    </div>

    {data.entries.length === 0 ? <section className={styles.empty}>
      <h2>No qualifying questions this week yet.</h2>
      <p>A question enters this ranking when it reaches 10 net upvotes. There is no response rate to compare until questions qualify.</p>
      <Link href="/#find-politician">Find someone and support a question <span aria-hidden="true">↗</span></Link>
    </section> : <section aria-labelledby="leaderboard-ranking">
      <h2 id="leaderboard-ranking" className={styles.sectionHeading}>The response record</h2>
      {data.totalAnsweredQuestions === 0 && <p className={styles.notice}>No official responses are recorded for this week’s qualifying questions. Every listed politician currently shares a 0% response rate.</p>}
      <p className={styles.meta}>Showing {start + 1} to {Math.min(start + visible.length, data.entries.length)} of {data.entries.length} eligible politicians. Ranks are calculated across the complete eligible population.</p>
      <ol start={start + 1} aria-label="Politicians ranked by official response rate" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {visible.map((entry) => <li key={entry.id}>
          <PublicPersonLink person={entry}
            eyebrow={`Rank ${entry.rank}${entry.is_candidate || entry.politician_type === "candidate" ? " · Candidate" : ""}`}
            detail={`${entry.answeredQualifying} of ${entry.qualifyingQuestions} qualifying ${entry.qualifyingQuestions === 1 ? "question has" : "questions have"} an official response.`}
            trailing={<span className={styles.stat}><strong style={{ color: entry.answeredQualifying > 0 ? "var(--green)" : "var(--ink)" }}>{percent.format(entry.responseRate)}%</strong><span>official response rate</span></span>} />
        </li>)}
      </ol>
      {pageCount > 1 && <nav aria-label="Leaderboard pages" className={styles.pagination}>
        {page > 1 ? <Link href={page === 2 ? "/leaderboard" : `/leaderboard?page=${page - 1}`} rel="prev">← Previous page</Link> : <span />}
        <span className={styles.meta}>Page {page} of {pageCount}</span>
        {page < pageCount ? <Link href={`/leaderboard?page=${page + 1}`} rel="next">Next page →</Link> : <span />}
      </nav>}
    </section>}

    <section aria-labelledby="leaderboard-methodology" className={styles.footnote}>
      <h2 id="leaderboard-methodology" className={styles.sectionHeading}>How the ranking works</h2>
      <p>Response rate is the share of this week’s active questions with 10 or more net upvotes that have at least one published official response from the politician or their team. Each qualifying question counts once. AI analysis and unpublished drafts do not count.</p>
      <p>The population includes active politician and candidate profiles, with test profiles excluded. Equal unrounded response rates share a rank. Within a tie, profiles with more qualifying questions appear first, followed by name. A missing response does not establish that a politician saw or declined a question.</p>
      <p>Updated {updated} UTC. Records refresh about every five minutes. This ranking is calculated from question and published response records; it does not use historical snapshot rates.</p>
    </section>
  </PublicPage>;
}
