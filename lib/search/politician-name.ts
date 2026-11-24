export function preparePoliticianName(value: string) {
  const literal = value.trim().toLowerCase();
  const words = literal.normalize("NFD").replace(/\p{M}/gu, "").replace(/['’]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return { literal, words };
}

type PreparedName = ReturnType<typeof preparePoliticianName>;

function isOneEditAway(left: string, right: string): boolean {
  if (Math.max(left.length, right.length) < 4 || Math.abs(left.length - right.length) > 1) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  let index = 0;
  while (index < shorter.length && shorter[index] === longer[index]) index++;
  if (shorter.length !== longer.length) return shorter.slice(index) === longer.slice(index + 1);
  if (shorter.slice(index + 1) === longer.slice(index + 1)) return true;
  return shorter[index] === longer[index + 1] && shorter[index + 1] === longer[index] &&
    shorter.slice(index + 2) === longer.slice(index + 2);
}

// Lower ranks are stronger. Allow the last word to be a prefix while typing,
// skip initials between matched words, and accept at most one typo per query.
export function politicianNameRank(name: PreparedName, query: PreparedName): number {
  if (!query.literal) return Infinity;
  if (name.literal === query.literal) return 0;
  if (name.literal.startsWith(query.literal)) return 1;
  if (name.literal.includes(query.literal)) return 2;
  if (!query.words.length || query.words.length > name.words.length) return Infinity;

  let best = Infinity;
  for (let start = 0; start <= name.words.length - query.words.length; start++) {
    let position = start;
    let typo = false;
    let matched = 0;
    for (const word of query.words) {
      while (matched > 0 && name.words[position]?.length === 1 && name.words[position] !== word) position++;
      const candidate = name.words[position++];
      if (!candidate) break;
      if (candidate !== word && !(matched === query.words.length - 1 && candidate.startsWith(word))) {
        if (typo || (query.words.length === 1 && word.length < 4) || !isOneEditAway(word, candidate)) break;
        typo = true;
      }
      matched++;
    }
    if (matched === query.words.length) {
      if (!typo) return 3;
      best = 4;
    }
  }
  return best;
}
