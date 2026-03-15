"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type SearchResult = {
  id: string;
  slug: string;
  full_name: string;
  office: string | null;
  state: string | null;
  party: string | null;
  photo_url: string | null;
};

export function PoliticianSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/politicians/search?q=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = (await res.json()) as { politicians: SearchResult[] };
          setResults(data.politicians ?? []);
          setIsOpen(true);
        }
      } catch {
        // Fail silently — search is enhancement, not critical
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-lg mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search for a politician by name…"
          className="w-full rounded-lg border bg-background px-4 py-3 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {isLoading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
          <ul className="divide-y divide-border">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/${r.slug}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                >
                  {/* Avatar */}
                  <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border bg-muted text-xs font-bold text-muted-foreground overflow-hidden">
                    {r.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.photo_url}
                        alt={r.full_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      r.full_name.slice(0, 1).toUpperCase()
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[r.office, r.state].filter(Boolean).join(" · ")}
                      {r.party && ` · ${r.party}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOpen && !isLoading && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover px-4 py-3 shadow-lg">
          <p className="text-sm text-muted-foreground">No politicians found for &quot;{query}&quot;</p>
        </div>
      )}
    </div>
  );
}
