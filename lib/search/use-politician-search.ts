"use client";

import { useEffect, useState } from "react";

export type SearchIndexEntry = {
  n: string;         // full_name
  s: string;         // slug
  st: string | null; // state code
  o: string | null;  // office
  p: string | null;  // party
};

// Module-level cache persists across component mounts within the same page session.
// Intentional design: prefetch once after hydration, filter client-side on every keystroke.
let cachedIndex: SearchIndexEntry[] | null = null;
let fetchPromise: Promise<void> | null = null;

function loadIndex(): Promise<void> {
  if (cachedIndex !== null) return Promise.resolve();
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/api/politicians/search-index")
    .then((r) => r.json())
    .then((data: SearchIndexEntry[]) => {
      cachedIndex = data;
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
    const q = query.toLowerCase().trim();
    const results: SearchIndexEntry[] = [];
    for (const entry of cachedIndex) {
      if (results.length >= limit) break;
      if (
        entry.n.toLowerCase().includes(q) ||
        (entry.st && entry.st.toLowerCase() === q) ||
        (entry.o && entry.o.toLowerCase().includes(q))
      ) {
        results.push(entry);
      }
    }
    return results;
  }

  return { ready, search };
}
