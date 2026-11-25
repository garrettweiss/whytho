"use client";

import { useEffect, useState } from "react";
import { OFFICES, parseDirectorySearch } from "../directory/search";
import { politicianNameRank, preparePoliticianName } from "./politician-name";

export type SearchIndexEntry = {
  n: string;         // full_name
  s: string;         // slug
  st: string | null; // state code
  o: string | null;  // office
  p: string | null;  // party
};

// Module-level cache persists across component mounts within the same page session.
// Intentional design: prefetch once after hydration, filter client-side on every keystroke.
let cachedIndex: Array<{ entry: SearchIndexEntry; name: ReturnType<typeof preparePoliticianName> }> | null = null;
let fetchPromise: Promise<void> | null = null;

function loadIndex(): Promise<void> {
  if (cachedIndex !== null) return Promise.resolve();
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/api/politicians/search-index")
    .then((response) => {
      if (!response.ok) throw new Error("Search index unavailable");
      return response.json();
    })
    .then((data: SearchIndexEntry[]) => {
      cachedIndex = data.map((entry) => ({ entry, name: preparePoliticianName(entry.n) }));
    })
    .catch(() => {
      // Allow retry on next call
      fetchPromise = null;
    });
  return fetchPromise;
}

export function usePoliticianSearch() {
  const [ready, setReady] = useState(cachedIndex !== null);

  useEffect(() => {
    if (ready) return;
    loadIndex().then(() => setReady(true));
  }, [ready]);

  function search(query: string, limit = 5): SearchIndexEntry[] {
    if (!cachedIndex || query.trim().length < 2) return [];
    const prepared = preparePoliticianName(query);
    const parsed = prepared.literal.length <= 100 && !/[\u0000-\u001f\u007f]/.test(query)
      ? parseDirectorySearch(query) : null;
    const officeChoices = parsed?.filters.office ? [parsed.filters.office] : parsed?.officeChoices ?? [];
    const titledName = parsed?.filters.q && officeChoices.length ? preparePoliticianName(parsed.filters.q) : null;
    const titledOffices = new Set<string>(OFFICES.filter(({ value }) => officeChoices.includes(value)).flatMap(({ records }) => [...records]));
    const results: SearchIndexEntry[][] = [[], [], [], [], []];
    for (const { entry, name } of cachedIndex) {
      const metadataMatch = entry.st?.toLowerCase() === prepared.literal ||
        entry.o?.toLowerCase().includes(prepared.literal);
      const titleMatch = titledName && entry.o && titledOffices.has(entry.o) &&
        (!parsed?.filters.state || entry.st === parsed.filters.state)
        ? politicianNameRank(name, titledName) : Infinity;
      const rank = Math.min(politicianNameRank(name, prepared), titleMatch, metadataMatch ? 2 : Infinity);
      if (!Number.isFinite(rank)) continue;
      const bucket = results[rank]!;
      if (bucket.length < limit) bucket.push(entry);
    }
    return results.flat().slice(0, limit);
  }

  return { ready, search };
}
