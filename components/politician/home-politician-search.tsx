"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { PoliticianAvatar } from "./politician-avatar";

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedPolitician[]>(featured);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults(featured);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/politicians/search?q=${encodeURIComponent(query.trim())}&limit=12`
        );
        if (res.ok) {
          const data = (await res.json()) as { politicians: FeaturedPolitician[] };
          setResults(data.politicians ?? []);
          setSearched(true);
        }
      } catch {
        // fail silently
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, featured]);

  const partyColor = (party: string | null) => {
    if (party === "Democrat") return "bg-blue-500";
    if (party === "Republican") return "bg-red-500";
    if (party === "Independent") return "bg-purple-500";
    return "bg-muted-foreground";
  };

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, state, or office…"
          className="w-full rounded-xl border-2 border-border bg-background px-5 py-4 pr-12 text-base placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {isLoading ? (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>

      {/* Results label */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {searched
            ? `${results.length} result${results.length !== 1 ? "s" : ""} for "${query}"`
            : `Showing ${results.length} of ${totalCount.toLocaleString()} politicians tracked`}
        </p>
        {searched && (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Politician grid */}
      {results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {results.slice(0, 12).map((r) => (
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
      ) : searched ? (
        <div className="py-10 text-center border rounded-xl bg-muted/30">
          <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
          <button
            onClick={() => setQuery("")}
            className="mt-2 text-sm font-medium underline underline-offset-2 hover:text-muted-foreground transition-colors"
          >
            Clear search
          </button>
        </div>
      ) : null}

      {/* Browse all link */}
      <div className="pt-1">
        <Link
          href="/federal"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Browse all federal representatives →
        </Link>
      </div>
    </div>
  );
}
