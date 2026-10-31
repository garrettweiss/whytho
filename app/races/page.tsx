import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
import { STATES } from "@/lib/search/states";
import { ELECTION_OFFICES, ELECTION_PAGE_SIZE, electionDateLabel, electionDirectoryHref, electionPhaseLabel, electionStateName, electionToday, electionTypeLabel, parseElectionFilters } from "@/lib/elections/helpers";
import { loadElectionDirectory } from "@/lib/elections/server";
import type { ElectionDirectory, ElectionPeriod, ElectionSearchParams } from "@/lib/elections/types";

export const metadata: Metadata = {
  title: "Elections | WhyTho",
  description: "Find an election, explore the candidates, and ask the questions you want answered.",
};
export const revalidate = 900;

const PERIODS: { value: ElectionPeriod; label: string }[] = [
  { value: "upcoming", label: "Upcoming elections" },
  { value: "past", label: "Past elections" },
  { value: "all", label: "All records" },
];

export default async function RacesPage({ searchParams }: { searchParams: Promise<ElectionSearchParams> }) {
  const filters = parseElectionFilters(await searchParams);
  const today = electionToday();
  let directory: ElectionDirectory | null = null;
  try { directory = await loadElectionDirectory(filters, today); } catch { /* Render a distinct failure state below. */ }
  const pages = directory ? Math.max(1, Math.ceil(directory.total / ELECTION_PAGE_SIZE)) : 1;
  const firstItem = (filters.page - 1) * ELECTION_PAGE_SIZE + 1;

  return <PublicPage title="Before you vote, ask." kicker="Elections" description="Find a race. Meet the candidates. Open their profiles and ask what you want answered.">
    <nav className={styles.tabs} aria-label="Election period">
      {PERIODS.map((period) => <Link key={period.value} href={electionDirectoryHref(filters, { period: period.value, page: 1 })} aria-current={filters.period === period.value ? "page" : undefined}>{period.label}</Link>)}
    </nav>
    <form key={`${filters.state}:${filters.office}:${filters.period}`} action="/races" method="get" className={styles.filterForm} aria-label="Filter elections">
      <input type="hidden" name="period" value={filters.period} />
      <label className={styles.field}>State
        <select name="state" defaultValue={filters.state}>
          <option value="">All states</option>
          {STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
        </select>
      </label>
      <label className={styles.field}>Office
        <select name="filter" defaultValue={filters.office}>
          {ELECTION_OFFICES.map((office) => <option key={office.value} value={office.value}>{office.label}</option>)}
        </select>
      </label>
      <button type="submit" className={styles.button}>Find races <span aria-hidden="true">→</span></button>
    </form>

    {!directory ? <section className={styles.empty} role="alert">
      <h2>Election records could not load.</h2>
      <p>We could not retrieve the race directory. Please try again.</p>
      <Link href={electionDirectoryHref(filters)}>Reload election records</Link>
    </section> : directory.races.length === 0 ? <section className={styles.empty}>
      <h2>{directory.total > 0 ? "No races on this page." : filters.period === "upcoming" ? "No upcoming races listed here yet." : "No races match these filters."}</h2>
      <p>{directory.total > 0 ? "Return to the first page to explore the matching races." : "WhyTho’s race directory is still growing. You can also find a politician directly and explore their questions."}</p>
      {directory.total > 0 ? <Link href={electionDirectoryHref(filters, { page: 1 })}>Go to the first page</Link> : <>
        <Link href={electionDirectoryHref(filters, { office: "all", state: "", period: "all", page: 1 })}>View all election records</Link>{" · "}<Link href="/#find-politician">Find a politician</Link>
      </>}
    </section> : <>
      <h2 className={styles.sectionHeading}>{filters.state ? `${electionStateName(filters.state)} races` : "Explore the races"}</h2>
      <p className={styles.meta}>{directory.total.toLocaleString()} matching race{directory.total === 1 ? "" : "s"}. Showing {firstItem.toLocaleString()}–{(firstItem + directory.races.length - 1).toLocaleString()}.</p>
      <div className={styles.rowList}>
        {directory.races.map((race) => <Link key={race.id} href={`/races/${encodeURIComponent(race.slug)}`} prefetch={false} className={styles.row}>
          <div className={styles.rowMain}>
            <p className={styles.rowMeta}>{electionStateName(race.state)} · {race.office}{race.district ? ` · District ${race.district}` : ""}</p>
            <h3 className={styles.rowTitle}>{race.name}</h3>
            <p className={styles.rowMeta}>{electionTypeLabel(race.election_type)} · {electionDateLabel(race.election_date)}{race.party ? ` · ${race.party}` : ""}</p>
          </div>
          <div className={styles.rowAside}>
            <p>{electionPhaseLabel(race, today)}</p>
            <p>{race.candidateCount.toLocaleString()} linked candidate profile{race.candidateCount === 1 ? "" : "s"} <span aria-hidden="true">↗</span></p>
          </div>
        </Link>)}
      </div>
      <nav className={styles.pagination} aria-label="Election pages">
        {filters.page > 1 ? <Link href={electionDirectoryHref(filters, { page: filters.page - 1 })}>← Previous races</Link> : <span />}
        <span className={styles.meta}>Page {filters.page} of {pages.toLocaleString()}</span>
        {filters.page < pages ? <Link href={electionDirectoryHref(filters, { page: filters.page + 1 })}>Next races →</Link> : <span />}
      </nav>
    </>}
    <p className={styles.footnote}>Race and candidate listings reflect the records available on WhyTho. Dates determine whether an election is upcoming or past; they do not establish a winner.</p>
  </PublicPage>;
}
