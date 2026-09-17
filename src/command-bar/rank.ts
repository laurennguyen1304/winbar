// Name matching for the command bar (SPEC-command-bar §5.4), in the spirit of yasb Quick Launch's fuzzy.py:
// exact, initials ("vsc" → Visual Studio Code), prefix, word prefix, substring, then letters in order.
// Case and Vietnamese diacritics are ignored.

export enum Tier {
  Subsequence = 1,
  Substring = 2,
  WordPrefix = 3,
  Prefix = 4,
  Initials = 5,
  Exact = 6,
}

/** Lower-case without diacritics: "Cài đặt" → "cai dat". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

/** Words split on spaces and punctuation, and on camelCase boundaries ("WindowsTerminal" → windows, terminal). */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .map(fold)
    .filter(Boolean);
}

export function initials(name: string): string {
  return words(name)
    .map((w) => w[0])
    .join("");
}

function isSubsequence(query: string, text: string): boolean {
  let at = 0;
  for (const c of text) {
    if (c === query[at]) at++;
    if (at === query.length) return true;
  }
  return false;
}

export interface NameScore {
  tier: Tier;
  /** Higher is better: tier first, then shorter names. */
  score: number;
}

export function scoreName(query: string, name: string): NameScore | null {
  const q = fold(query);
  if (!q) return null;
  const n = fold(name);
  const tier = (() => {
    if (n === q) return Tier.Exact;
    if (q.length >= 2 && !q.includes(" ") && initials(name).startsWith(q)) return Tier.Initials;
    if (n.startsWith(q)) return Tier.Prefix;
    if (words(name).some((w) => w.startsWith(q)) || n.includes(` ${q}`)) return Tier.WordPrefix;
    if (n.includes(q)) return Tier.Substring;
    if (isSubsequence(q.replace(/\s+/g, ""), n.replace(/\s+/g, ""))) return Tier.Subsequence;
    return null;
  })();
  if (tier === null) return null;
  return { tier, score: tier * 10_000 - Math.min(n.length, 9_999) };
}

/**
 * Matching items, best first; ties keep their original order. Letters-in-order matches are noise next to real
 * ones ("code" also fits "Microsoft Edge"), so they only count when nothing matches better.
 */
export function rankNames<T>(query: string, items: readonly T[], nameOf: (item: T) => string) {
  const matches = items.flatMap((item, index) => {
    const s = scoreName(query, nameOf(item));
    return s ? [{ item, index, ...s }] : [];
  });
  const hasRealMatch = matches.some((m) => m.tier > Tier.Subsequence);
  return matches
    .filter((m) => !hasRealMatch || m.tier > Tier.Subsequence)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
