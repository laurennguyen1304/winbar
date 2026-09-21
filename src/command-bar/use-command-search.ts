import { useEffect, useState } from "react";
import { searchAll, type Group, type Slot } from "./search";

/**
 * How long results of the previous text may stay on screen while the new search has not reported yet. Short
 * enough that rows for old text never linger (a slow file search took ~1 s), long enough to avoid flicker
 * between fast keystrokes.
 */
export const STALE_MS = 150;

/**
 * Groups for `query`, updated as providers answer. Typing again aborts the previous search.
 * `settled` is true once every provider for the current query has answered (or failed).
 */
export function useCommandSearch(query: string, slots: readonly Slot[]) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [settledFor, setSettledFor] = useState<{ query: string; slots: readonly Slot[] } | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    let reported = false;
    const dropStale = setTimeout(() => {
      if (!reported && !controller.signal.aborted) setGroups([]);
    }, STALE_MS);
    searchAll(query, slots, controller.signal, (g) => {
      if (controller.signal.aborted) return;
      reported = true;
      setGroups(g);
    })
      .then((g) => {
        if (controller.signal.aborted) return;
        reported = true;
        setGroups(g);
        setSettledFor({ query, slots });
      })
      .catch((err: unknown) => console.error("command bar search failed", err));
    return () => {
      clearTimeout(dropStale);
      controller.abort();
    };
  }, [query, slots]);

  return { groups, settled: settledFor?.query === query && settledFor.slots === slots };
}
