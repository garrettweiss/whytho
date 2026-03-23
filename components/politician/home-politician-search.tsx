"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { PoliticianAvatar } from "./politician-avatar";
import { usePoliticianSearch } from "@/lib/search/use-politician-search";
import { matchingStates } from "@/lib/search/states";

export type FeaturedPolitician = {
  id: string;
  slug: string;
  full_name: string;
  office: string | null;
  state: string | null;
  party: string | null;
  photo_url: string | null;
};

export function HomePoliticianSearch({
  featured,
  totalCount,
}: {
  featured: FeaturedPolitician[];
  totalCount: number;
}) {
  const { search } = usePoliticianSearch();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearching = query.trim().length >= 2;
  const politicianResults = isSearching ? search(query, 12) : [];
  const stateResults = isSearching ? matchingStates(query) : [];

  const partyColor = (party: string | null) => {
    if (party === "Democrat") return "bg-blue-500";
    if (party === "Republican") return "bg-red-500";
    if (party === "Independent") return "bg-purple-500";
    return "bg-muted-foreground";
  };

  const noResults = isSearching && politicianResults.length === 0 && stateResults.length === 0;

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, state, or office..."
          className="w-full rounded-xl border-2 border-border bg-background pl-12 pr-12 py-4 text-base placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* State / region results */}
      {stateResults.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Regions
          </p>
          <div className="flex flex-wrap gap-2">
            {stateResults.map((state) => (
              <Link
                key={state.code}
                href={`/region/${state.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted hover:border-foreground/20 transition-all"
              >
                <span>📍</span>
                <span>{state.name}</span>
                <span className="text-muted-foreground text-xs">{state.code}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Politician results / featured grid */}
      {isSearching ? (
        <>
          {politicianResults.length > 0 && (
            <div>
              {stateResults.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Politicians
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {politicianResults.map((r) => (
                  <Link
                    key={r.s}
                    href={`/${r.s}`}
                    className="group flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 hover:bg-muted hover:border-foreground/20 transition-all"
                  >
                    <div className="relative shrink-0">
                      <PoliticianAvatar photoUrl={null} fullName={r.n} size={32} />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${partyColor(r.p)}`}
                        aria-hidden
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">{r.n}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[r.o, r.st].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {noResults && (
            <div className="py-10 text-center border rounded-xl bg-muted/30">
              <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
              <button
                onClick={() => setQuery("")}
                className="mt-2 text-sm font-medium underline underline-offset-2 hover:text-muted-foreground transition-colors"
              >
                Clear search
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Featured grid when not searching */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {totalCount.toLocaleString()} politicians tracked
            </p>
          </div>
          {featured.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {featured.slice(0, 12).map((r) => (
                <Link
                  key={r.id}
                  href={`/${r.slug}`}
                  className="group flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 hover:bg-muted hover:border-foreground/20 transition-all"
                >
                  <div className="relative shrink-0">
                    <PoliticianAvatar photoUrl={r.photo_url} fullName={r.full_name} size={32} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${partyColor(r.party)}`}
                      aria-hidden
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.state ?? r.office ?? "-"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
