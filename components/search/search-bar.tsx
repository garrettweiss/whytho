"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePoliticianSearch, type SearchIndexEntry } from "@/lib/search/use-politician-search";
import { matchingStates, type StateEntry } from "@/lib/search/states";

function partyColor(party: string | null) {
  if (party === "Democrat") return "bg-blue-500";
  if (party === "Republican") return "bg-red-500";
  if (party === "Independent") return "bg-purple-500";
  return "bg-muted-foreground";
}

type ResultItem =
  | { kind: "politician"; entry: SearchIndexEntry }
  | { kind: "state"; state: StateEntry };

export function SearchBar({ placeholder = "Search politicians, states..." }: { placeholder?: string }) {
  const router = useRouter();
  const { search } = usePoliticianSearch();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const politicianResults = query.trim().length >= 2 ? search(query, 5) : [];
  const stateResults = matchingStates(query);

  const items: ResultItem[] = [
    ...politicianResults.map((e) => ({ kind: "politician" as const, entry: e })),
    ...stateResults.map((s) => ({ kind: "state" as const, state: s })),
  ];

  const hasResults = items.length > 0;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(item: ResultItem) {
    if (item.kind === "politician") {
      router.push(`/${item.entry.s}`);
    } else {
      router.push(`/region/${item.state.slug}`);
    }
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !hasResults) {
      if (e.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(items[activeIndex]!);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border bg-muted/40 pl-9 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border bg-popover shadow-lg ring-1 ring-foreground/5 overflow-hidden"
        >
          {!hasResults ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            <>
              {politicianResults.length > 0 && (
                <div>
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Politicians
                  </p>
                  {politicianResults.map((entry, i) => {
                    const isActive = activeIndex === i;
                    return (
                      <button
                        key={entry.s}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseDown={(e) => { e.preventDefault(); handleSelect({ kind: "politician", entry }); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isActive ? "bg-accent" : "hover:bg-accent/50"}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${partyColor(entry.p)}`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{entry.n}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[entry.o, entry.st].filter(Boolean).join(", ")}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {stateResults.length > 0 && (
                <div className={politicianResults.length > 0 ? "border-t" : ""}>
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Regions
                  </p>
                  {stateResults.map((state, i) => {
                    const idx = politicianResults.length + i;
                    const isActive = activeIndex === idx;
                    return (
                      <button
                        key={state.code}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => { e.preventDefault(); handleSelect({ kind: "state", state }); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isActive ? "bg-accent" : "hover:bg-accent/50"}`}
                      >
                        <span className="text-muted-foreground text-sm shrink-0">📍</span>
                        <p className="text-sm font-medium">{state.name}</p>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{state.code}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <div className="border-t px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Press Enter to select, Esc to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
