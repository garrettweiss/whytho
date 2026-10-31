"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ArrowRight, Check, ArrowUp } from "lucide-react";
import type { DirectoryFilters, DirectoryPage, DirectoryPerson } from "@/lib/directory/types";
import { OFFICES, parseDirectorySearch } from "@/lib/directory/search";
import { allowedOfficeValues, federalChamberOffice, constrainDirectoryFilters, directoryContextDefaults, type DirectoryContext } from "@/lib/directory/scope";
import { STATES, stateByCode } from "@/lib/search/states";
import styles from "./home.module.css";

const directoryHistory = new Map<string, { key: string; page: DirectoryPage; scroll: number }>();
const keyOf = (filters: DirectoryFilters) => JSON.stringify([filters.q, filters.state, filters.office, filters.scope ?? ""]);
function urlFilters(context?: DirectoryContext): DirectoryFilters {
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state") ?? "";
  const office = params.get("office") ?? (context?.basePath === "/federal" ? federalChamberOffice(params.get("chamber") ?? undefined) : "");
  return constrainDirectoryFilters({ q: (params.get("q") ?? "").slice(0, 100), state: STATES.some(s => s.code === state) ? state : "", office: OFFICES.some(o => o.value === office) ? office : "" }, context);
}
function periodLabel(week: number) {
  const year = Math.floor(week / 100);
  const january4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(january4);
  monday.setUTCDate(january4.getUTCDate() - ((january4.getUTCDay() + 6) % 7) + ((week % 100) - 1) * 7);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${format.format(monday)} to ${format.format(sunday)}, ${year}`;
}

function PortraitCard({ person, index }: { person: DirectoryPerson; index: number }) {
  const [failed, setFailed] = useState(false);
  const responded = person.replyCount > 0;
  const state = stateByCode(person.state ?? "")?.name ?? person.state;
  const initials = person.full_name.split(/\s+/).map(p => p[0]).slice(0, 2).join("");
  return <li className={styles.personItem}>
    <Link href={`/${person.slug}`} prefetch={false} className={`${styles.person} ${responded ? styles.responded : ""}`} data-person-id={person.id}>
      <div className={styles.photo}>
        {/* Native images avoid proxying arbitrary civic-photo hosts through our server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {person.photo_url && !failed ? <img src={person.photo_url} alt="" width={400} height={500} loading={index < 4 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className={styles.photoFallback} aria-hidden="true">{initials}</span>}
      </div>
      <div className={styles.personMeta}>
        <p className={styles.office}>{person.is_candidate ? `${person.incumbent_challenge === "I" ? "Incumbent · " : ""}Candidate · ` : ""}{person.office || "Public official"}</p>
        <h3>{person.full_name}</h3>
        <p className={styles.place}>{[state, person.party].filter(Boolean).join(" · ")}</p>
        <div className={styles.record}>{responded ? <Check size={16} aria-hidden="true" /> : <span aria-hidden="true">○</span>}<span>{responded ? "Official response recorded" : person.questionCount > 0 ? "No official response recorded" : "No questions yet"}</span></div>
        <p className={styles.recordDetail}>{person.questionCount} {person.questionCount === 1 ? "question" : "questions"} in this week’s record</p>
        <span className={styles.cardAction}>View questions <ArrowRight size={17} aria-hidden="true" /></span>
      </div>
    </Link>
  </li>;
}

export function PoliticianDirectory({ initialPage, context }: { initialPage: DirectoryPage; context?: DirectoryContext }) {
  const defaults = useMemo(() => directoryContextDefaults(context), [context]);
  const officeOptions = OFFICES.filter(office => !allowedOfficeValues(context?.scope) || allowedOfficeValues(context?.scope)?.includes(office.value));
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState<DirectoryFilters>(defaults);
  const [text, setText] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [inputError, setInputError] = useState("");
  const [nameAlternative, setNameAlternative] = useState("");
  const choiceGroup = useRef<HTMLDivElement>(null);
  const activeEntry = useRef("");
  const automaticRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [automatic, setAutomatic] = useState(true);
  automaticRef.current = automatic;
  const [colors, setColors] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const firstNew = useRef<string | null>(null);
  const lastRequest = useRef<{ filters: DirectoryFilters; cursor?: string }>({ filters: defaults });
  const current = useRef({ filters, page });
  current.current = { filters, page };

  const savePosition = useCallback(() => {
    if (!activeEntry.current || loading.current) return;
    directoryHistory.set(activeEntry.current, { key: `${context?.basePath ?? "/"}:${keyOf(current.current.filters)}`, page: current.current.page, scroll: window.scrollY });
    if (directoryHistory.size > 20) directoryHistory.delete(directoryHistory.keys().next().value!);
  }, [context?.basePath]);

  const cancelRequests = useCallback(() => {
    controller.current?.abort(); ++generation.current; loading.current = false;
  }, []);

  const fetchPage = useCallback(async (nextFilters: DirectoryFilters, cursor?: string, manual = false) => {
    if (cursor && loading.current) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const requestId = ++generation.current;
    loading.current = true; setBusy(true); setError(""); setAnnouncement("Loading politicians.");
    lastRequest.current = { filters: nextFilters, cursor };
    if (!cursor) { setFilters(nextFilters); setPage(previous => ({ ...previous, people: [], nextCursor: null })); }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) if (value) params.set(key, value);
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/politicians/directory?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error("Directory unavailable");
      const next: DirectoryPage = await response.json();
      if (requestId !== generation.current) return;
      if (!Array.isArray(next.people) || typeof next.weekNumber !== "number") throw new Error("Invalid directory");
      if (cursor && manual) firstNew.current = next.people[0]?.id ?? null;
      setPage(previous => ({ ...next, people: cursor ? [...previous.people, ...next.people.filter(person => !previous.people.some(existing => existing.id === person.id))] : next.people }));
      setAnnouncement(`${next.people.length} ${next.people.length === 1 ? "politician" : "politicians"} ${cursor ? "added" : "loaded"}.${next.nextCursor ? " More results are available." : " End of results."}`);
    } catch {
      if (request.signal.aborted || requestId !== generation.current) return;
      setError("We couldn’t load politicians. Try again."); setAnnouncement("We couldn’t load politicians. Try again.");
    } finally {
      if (requestId === generation.current) { loading.current = false; setBusy(false); }
    }
  }, []);

  useEffect(() => {
    const restore = (event?: PopStateEvent) => {
      // Native section links create history entries without changing the search.
      // Keep the loaded batches when only the hash changed.
      let nextFilters: DirectoryFilters;
      try { nextFilters = urlFilters(context); } catch { setInputError("These filters are outside this directory. Clear filters or use All politicians."); return; }
      if (event && keyOf(nextFilters) === keyOf(current.current.filters) &&
        (!window.history.state?.whythoDirectoryId || window.history.state.whythoDirectoryId === activeEntry.current)) {
        window.history.replaceState({ ...window.history.state, whythoDirectoryId: activeEntry.current }, "");
        return;
      }
      cancelRequests();
      setBusy(false); setError(""); setInputError(""); setChoices([]); setNameAlternative(""); firstNew.current = null;
      setFilters(nextFilters); setText(nextFilters.q);
      let entry = window.history.state?.whythoDirectoryId as string | undefined;
      if (!entry) {
        entry = crypto.randomUUID();
        window.history.replaceState({ ...window.history.state, whythoDirectoryId: entry }, "");
      }
      activeEntry.current = entry;
      const saved = directoryHistory.get(entry);
      if (saved?.key === `${context?.basePath ?? "/"}:${keyOf(nextFilters)}`) {
        setPage(saved.page);
        requestAnimationFrame(() => window.scrollTo(0, saved.scroll));
      } else if (keyOf(nextFilters) !== keyOf(defaults)) { void fetchPage(nextFilters); }
      else { setPage(initialPage); }
    };
    const beforeNavigation = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && link.target !== "_blank") savePosition();
      if (link.hash === "#how-it-works") { automaticRef.current = false; setAutomatic(false); }
    };
    const pauseBelowResults = (event: FocusEvent | MouseEvent) => {
      const target = event.target as Element;
      if (target.closest?.("footer, [data-directory-end]")) { automaticRef.current = false; setAutomatic(false); }
    };
    restore();
    window.addEventListener("popstate", restore);
    document.addEventListener("click", beforeNavigation, true);
    document.addEventListener("click", pauseBelowResults, true);
    document.addEventListener("focusin", pauseBelowResults);
    window.addEventListener("pagehide", savePosition);
    return () => {
      cancelRequests();
      window.removeEventListener("popstate", restore);
      document.removeEventListener("click", beforeNavigation, true);
      document.removeEventListener("click", pauseBelowResults, true);
      document.removeEventListener("focusin", pauseBelowResults);
      window.removeEventListener("pagehide", savePosition);
    };
  }, [fetchPage, initialPage, cancelRequests, context, defaults, savePosition]);

  useEffect(() => {
    if (choices.length) choiceGroup.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [choices]);

  useEffect(() => {
    if (!firstNew.current) return;
    document.querySelector<HTMLAnchorElement>(`[data-person-id="${firstNew.current}"]`)?.focus();
    firstNew.current = null;
  }, [page]);

  useEffect(() => {
    if (!automatic || busy || error || !page.nextCursor || !sentinel.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (automaticRef.current && entries.some(entry => entry.isIntersecting)) void fetchPage(filters, page.nextCursor ?? undefined);
    }, { rootMargin: "300px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [automatic, busy, error, page.nextCursor, fetchPage, filters]);

  function apply(nextFilters: DirectoryFilters) {
    try { nextFilters = constrainDirectoryFilters(nextFilters, context); } catch (error) { setInputError(error instanceof Error ? error.message : "Choose filters within this directory."); return; }
    savePosition();
    activeEntry.current = crypto.randomUUID();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) if (value) params.set(key, value);
    window.history.pushState({ ...window.history.state, whythoDirectoryId: activeEntry.current }, "", params.size ? `${context?.basePath ?? "/"}?${params}` : context?.basePath ?? "/");
    setChoices([]); setInputError(""); void fetchPage(nextFilters);
  }
  function search(value: string) {
    setText(value); setInputError(""); setNameAlternative("");
    try {
      const parsed = parseDirectorySearch(value);
      const availableChoices = parsed.officeChoices.filter(value => officeOptions.some(office => office.value === value));
      if (availableChoices.length === 1) {
        apply({ ...parsed.filters, state: parsed.filters.state || filters.state, office: availableChoices[0]! }); return;
      }
      if (availableChoices.length) {
        setChoices(availableChoices);
        setAnnouncement("Choose which office you mean: " + availableChoices.map(choice => OFFICES.find(office => office.value === choice)?.label).join(" or "));
        return;
      }
      if (parsed.filters.state && !parsed.filters.office && !parsed.filters.q) setNameAlternative(value.trim());
      apply({ q: parsed.filters.q, state: parsed.filters.state || filters.state, office: parsed.filters.office || filters.office });
    } catch {
      setInputError("Use a name, state, or office of 100 characters or fewer.");
    }
  }

  const activeFilters = keyOf(filters) !== keyOf(defaults);
  return <>
    <section className={styles.searchArea} aria-label="Find a politician">
      <form id="find-politician" role="search" className={styles.searchForm} onSubmit={event => { event.preventDefault(); search(text); }}>
        <Search size={25} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor="politician-search">Search by name, state, or office</label>
        <input ref={input} id="politician-search" type="search" value={text} maxLength={100} placeholder="Name, state, or office" autoComplete="off" aria-invalid={!!inputError} aria-describedby={inputError ? "search-error" : undefined} onChange={event => { setText(event.target.value); setChoices([]); setInputError(""); setNameAlternative(""); }} onKeyDown={event => { if (event.key === "Escape") setChoices([]); }} />
        <button type="submit" aria-label="Find politicians"><span className={styles.submitLabel}>Find politicians</span><ArrowRight size={24} aria-hidden="true" /></button>
      </form>
      {inputError && <p id="search-error" role="alert" className={styles.inputError}>{inputError}</p>}
      <div className={styles.examples}><span>Try</span>{(context ? (context.scope === "state" ? ["State Senate", "State House", "Governor"] : context.state ? ["U.S. Senate", "State Senate", "Governor"] : ["U.S. Senate", "U.S. House", "Cabinet", "Governor"]) : ["AOC", "California", "Congress Senate", "California state senator"]).map(example => <button key={example} onClick={() => search(example)}>{example}</button>)}</div>
      {choices.length > 0 && <div ref={choiceGroup} className={styles.officeChoices} role="group" aria-label="Which office do you mean?" onKeyDown={event => { if (event.key === "Escape") { setChoices([]); input.current?.focus(); } }}><p>Which office do you mean?</p>{choices.map(value => <button key={value} onClick={() => { const parsed = parseDirectorySearch(text); apply({ ...parsed.filters, state: parsed.filters.state || filters.state, office: value }); }}>{OFFICES.find(office => office.value === value)?.label ?? value}{parseDirectorySearch(text).filters.state ? ` · ${stateByCode(parseDirectorySearch(text).filters.state)?.name}` : ""}</button>)}</div>}
      {nameAlternative && <button className={styles.nameAlternative} onClick={() => { const name = nameAlternative; setNameAlternative(""); apply({ q: name, state: "", office: "" }); }}>Looking for a person? Search names for “{nameAlternative}”</button>}
      <div className={styles.filters}>
        {!context?.state && <label>State<select aria-label="Filter by state" value={filters.state} onChange={event => apply({ ...filters, state: event.target.value })}><option value="">All states</option>{STATES.map(state => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>}
        <label>Office<select aria-label="Filter by office" value={filters.office} onChange={event => apply({ ...filters, office: event.target.value })}><option value="">All offices</option>{officeOptions.map(office => <option key={office.value} value={office.value}>{office.label}</option>)}</select></label>
        {(activeFilters || inputError) && <button className={styles.clearFilters} onClick={() => { setText(""); apply(defaults); }}>Clear filters <span aria-hidden="true">×</span></button>}
        {context && <Link className={styles.clearFilters} href="/#find-politician">All politicians ↗</Link>}
        {filters.q && <span className={styles.searchTerm}>Name: {filters.q}</span>}
      </div>
    </section>
    <section className={styles.directory} aria-labelledby="directory-title">
      <div className={styles.directoryHead}>
        <div><h2 id="directory-title">{activeFilters ? "Your search results" : "Politicians on the record"}</h2><p>Questions for {periodLabel(page.weekNumber)}</p></div>
        <div className={styles.directoryTools}><label className={styles.autoLoad}><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Load as I scroll</label><button className={styles.colorToggle} aria-pressed={colors} onClick={() => setColors(!colors)}>{colors ? "Hide portrait colors" : "Show portrait colors"}</button></div>
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      <ul className={`${styles.people} ${colors ? styles.showColors : ""}`} aria-label="Politicians" aria-busy={busy} onClick={savePosition} onKeyDown={event => { if (event.key === "Enter") savePosition(); }}>
        {page.people.map((person, index) => <PortraitCard key={person.id} person={person} index={index} />)}
      </ul>
      {!busy && !error && page.people.length === 0 && <div className={styles.emptyState}><h3>No politicians match these filters.</h3><p>Try a different name, state, or office.</p><button onClick={() => { setText(""); apply(defaults); }}>{context ? "Reset this directory" : "Show all politicians"}</button></div>}
      <div className={styles.loadArea} onFocusCapture={() => { automaticRef.current = false; setAutomatic(false); }}>
        <p>{error || (busy ? "Loading politicians…" : page.nextCursor ? `${page.people.length} politicians loaded. Keep exploring.` : "You’ve reached the end of these results.")}</p>
        {error ? <button onClick={() => void fetchPage(lastRequest.current.filters, lastRequest.current.cursor)}>Try again</button> : page.nextCursor && <button disabled={busy} onClick={() => void fetchPage(filters, page.nextCursor ?? undefined, true)}>Load more politicians</button>}
        <button className={styles.returnSearch} onClick={() => input.current?.focus()}>Back to search <ArrowUp size={16} aria-hidden="true" /></button>
      </div>
      <div ref={sentinel} aria-hidden="true" className={styles.sentinel} />
      <details data-directory-end className={styles.methodology}><summary>What do the response labels mean?</summary><p>A green label means at least one published official response is recorded for this week’s questions. Responses may come from the politician or their team. AI analysis and unpublished drafts are excluded. A response does not mean every question has been answered. No recorded response does not establish that a politician saw or declined a question. Records refresh about every five minutes.</p></details>
    </section>
  </>;
}
