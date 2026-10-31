import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPage, PublicPersonLink } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
import { ELECTION_PAGE_SIZE, candidateRecordLabel, electionDateLabel, electionDetailHref, electionDirectoryHref, electionPhaseLabel, electionStateName, electionToday, electionTypeLabel, parseElectionPage } from "@/lib/elections/helpers";
import { loadElectionDetail, loadElectionRace } from "@/lib/elections/server";
import type { ElectionDetail } from "@/lib/elections/types";

export const revalidate = 900;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const race = await loadElectionRace(slug);
    if (race) return { title: `${race.name} | WhyTho`, description: `Explore the profiles linked to this ${race.office} race in ${electionStateName(race.state)} and ask candidates questions.` };
  } catch { /* The page presents an explicit load error. */ }
  return { title: "Election record | WhyTho" };
}

export default async function RaceDetailPage({ params, searchParams }: Props) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const page = parseElectionPage(search.page);
  let detail: ElectionDetail | null;
  try { detail = await loadElectionDetail(slug, page); } catch {
    return <PublicPage title="Election record unavailable." description="We could not load this race right now." breadcrumbs={[{ label: "Elections", href: "/races" }]}>
      <section className={styles.empty} role="alert"><h2>Please try again.</h2><p>This is a loading problem. It does not mean the race has no candidates.</p><Link href={electionDetailHref(slug, page)}>Reload the race</Link></section>
    </PublicPage>;
  }
  if (!detail) notFound();
  const { race, candidates, recordedOfficeholder, totalCandidates } = detail;
  const stateName = electionStateName(race.state);
  const today = electionToday();
  const phase = electionPhaseLabel(race, today);
  const stateHref = electionDirectoryHref({ office: "all", state: race.state, period: "all", page: 1 });
  const pages = Math.max(1, Math.ceil(totalCandidates / ELECTION_PAGE_SIZE));
  const firstItem = (page - 1) * ELECTION_PAGE_SIZE + 1;

  return <PublicPage title={race.name} kicker={`${electionTypeLabel(race.election_type)} · ${stateName}`} description={`Explore the people linked to this ${race.office} race. Open a profile to see their questions and responses.`}
    breadcrumbs={[{ label: "Elections", href: "/races" }, { label: stateName, href: stateHref }]}>
    <div className={styles.summary}>
      <div className={styles.stat}><strong>{electionDateLabel(race.election_date)}</strong>Recorded election date</div>
      <div className={styles.stat}><strong>{totalCandidates.toLocaleString()}</strong>Linked candidate profile{totalCandidates === 1 ? "" : "s"}</div>
      <div className={styles.stat}><strong>{phase}</strong>{race.office}{race.district ? ` · District ${race.district}` : ""}{race.party ? ` · ${race.party}` : ""}</div>
    </div>

    <section aria-labelledby="candidate-heading">
      <h2 id="candidate-heading" className={styles.sectionHeading}>Meet the candidates.</h2>
      {candidates.length > 0 ? <>
        <p className={styles.meta}>Showing {firstItem.toLocaleString()}–{(firstItem + candidates.length - 1).toLocaleString()} of {totalCandidates.toLocaleString()} linked profiles.</p>
        <div className={styles.grid}>
          {candidates.map((candidate) => <PublicPersonLink key={candidate.id} person={candidate} eyebrow={candidateRecordLabel(candidate)}
            detail={candidate.id === race.incumbent_id ? "Also recorded as the officeholder for this race." : !candidate.is_active ? "This profile is currently inactive." : undefined} />)}
        </div>
        <nav className={styles.pagination} aria-label="Candidate pages">
          {page > 1 ? <Link href={electionDetailHref(slug, page - 1)}>← Previous candidates</Link> : <span />}
          <span className={styles.meta}>Page {page} of {pages.toLocaleString()}</span>
          {page < pages ? <Link href={electionDetailHref(slug, page + 1)}>Next candidates →</Link> : <span />}
        </nav>
      </> : <div className={styles.empty}>
        <h2>{totalCandidates > 0 ? "No candidates on this page." : "Candidate profiles have not been linked yet."}</h2>
        <p>{totalCandidates > 0 ? "Return to the first page to explore the profiles linked to this race." : "You can still search WhyTho for the person you want to ask."}</p>
        <Link href={totalCandidates > 0 ? electionDetailHref(slug) : "/#find-politician"}>{totalCandidates > 0 ? "Go to the first candidate page" : "Find a politician"}</Link>
      </div>}
    </section>

    {recordedOfficeholder && <section aria-labelledby="officeholder-heading">
      <h2 id="officeholder-heading" className={styles.sectionHeading}>Recorded officeholder.</h2>
      <p className={styles.meta}>The person associated with this office in the race record. This listing alone does not establish that they are running.</p>
      <div className={styles.grid}><PublicPersonLink person={recordedOfficeholder}
        eyebrow={recordedOfficeholder.race_id === race.id ? "Also linked to this race as a candidate" : "Officeholder listed in this record"}
        detail={!recordedOfficeholder.is_active ? "This profile is currently inactive." : undefined} /></div>
    </section>}
    <p className={styles.footnote}>This page preserves profiles explicitly linked to the race, including people whose profiles later became inactive. Candidate labels reflect stored records. An election date passing does not establish a winner or a final result.</p>
  </PublicPage>;
}
