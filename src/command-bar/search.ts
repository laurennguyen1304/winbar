// Command bar search (SPEC-command-bar §5.4, §6): routes a query to providers, runs them in parallel with a
// timeout, and merges their results into ordered groups. Pure apart from timers; the React hook wraps it.
import type { SearchProvider, SearchResult } from "../shell/widget-contract";

/** One provider in the order the groups appear. */
export interface Slot {
  provider: SearchProvider;
  /** Rows shown without a prefix. */
  limit: number;
  /** Only asked when no other provider returned anything (web search). */
  fallback?: boolean;
}

export interface Group {
  id: string;
  title: string;
  results: SearchResult[];
}

/** Rows shown when a prefix selects a single provider. */
export const PREFIX_LIMIT = 20;
export const PROVIDER_TIMEOUT_MS = 1500;

/** Prefix → slot, lower-cased. When two providers claim the same prefix the first keeps it. */
export function resolvePrefixes(slots: readonly Slot[], warn: (message: string) => void = console.warn): Map<string, Slot> {
  const prefixes = new Map<string, Slot>();
  for (const slot of slots) {
    const prefix = slot.provider.prefix?.trim().toLowerCase();
    if (!prefix) continue;
    const owner = prefixes.get(prefix);
    if (owner) {
      warn(`command bar: prefix "${prefix}" of "${slot.provider.id}" is already used by "${owner.provider.id}"; ignoring it`);
      continue;
    }
    prefixes.set(prefix, slot);
  }
  return prefixes;
}

/** A prefix matches when it is the whole query or is followed by a space; the longest prefix wins. */
export function routeQuery(query: string, prefixes: ReadonlyMap<string, Slot>): { slot?: Slot; text: string } {
  const trimmed = query.trimStart();
  const lower = trimmed.toLowerCase();
  const byLength = [...prefixes.keys()].sort((a, b) => b.length - a.length);
  for (const prefix of byLength) {
    if (lower === prefix || lower.startsWith(`${prefix} `)) {
      return { slot: prefixes.get(prefix), text: trimmed.slice(prefix.length).trim() };
    }
  }
  return { slot: undefined, text: trimmed.trim() };
}

const byScore = (results: readonly SearchResult[]) =>
  results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0) || a.i - b.i)
    .map(({ r }) => r);

/** Runs one provider; a throw, a timeout or an abort all count as "no results". */
async function runProvider(provider: SearchProvider, text: string, signal: AbortSignal, timeoutMs: number): Promise<SearchResult[]> {
  const child = new AbortController();
  const abort = () => child.abort();
  signal.addEventListener("abort", abort);
  const timer = setTimeout(() => child.abort(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
  const aborted = new Promise<never>((_, reject) =>
    child.signal.addEventListener("abort", () => reject(child.signal.reason as Error)),
  );
  try {
    return await Promise.race([provider.search(text, child.signal), aborted]);
  } catch (err) {
    if (!signal.aborted) console.warn(`command bar: provider "${provider.id}" failed`, err);
    return [];
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/**
 * Searches `slots` for `query`. `onUpdate` receives the groups found so far, in slot order, each time a provider
 * finishes; the returned promise resolves with the final groups. Nothing is reported after `signal` aborts.
 */
export async function searchAll(
  query: string,
  slots: readonly Slot[],
  signal: AbortSignal,
  onUpdate: (groups: Group[]) => void,
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<Group[]> {
  const route = routeQuery(query, resolvePrefixes(slots));
  const shown = (s: Slot) => s.provider.inDefaultResults !== false;
  let active: Slot[];
  let fallbacks: Slot[] = [];
  if (route.slot) {
    active = [{ ...route.slot, limit: PREFIX_LIMIT }];
  } else if (!route.text) {
    return [];
  } else {
    active = slots.filter((s) => shown(s) && !s.fallback);
    fallbacks = slots.filter((s) => shown(s) && s.fallback);
  }

  const found = new Map<Slot, SearchResult[]>();
  const groups = () =>
    [...active, ...fallbacks]
      .filter((s) => (found.get(s)?.length ?? 0) > 0)
      .map((s) => ({ id: s.provider.id, title: s.provider.title, results: found.get(s) as SearchResult[] }));

  const runAll = (list: Slot[]) =>
    Promise.all(
      list.map(async (s) => {
        const results = await runProvider(s.provider, route.text, signal, timeoutMs);
        if (signal.aborted) return;
        found.set(s, byScore(results).slice(0, s.limit));
        if (results.length > 0) onUpdate(groups());
      }),
    );

  await runAll(active);
  if (!signal.aborted && fallbacks.length > 0 && groups().length === 0) await runAll(fallbacks);
  return signal.aborted ? [] : groups();
}
