import { useEffect, useState } from "react";
import { searchAll, type Group, type Slot } from "./search";

/**
 * Groups for `query`, updated as providers answer. Typing again aborts the previous search. Old groups stay on
 * screen until the new search reports, so rows do not flicker between keystrokes.
 * `settled` is true once every provider for the current query has answered (or failed).
 */
export function useCommandSearch(query: string, slots: readonly Slot[]) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [settledFor, setSettledFor] = useState<{ query: string; slots: readonly Slot[] } | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    searchAll(query, slots, controller.signal, (g) => !controller.signal.aborted && setGroups(g))
      .then((g) => {
        if (controller.signal.aborted) return;
        setGroups(g);
        setSettledFor({ query, slots });
      })
      .catch((err: unknown) => console.error("command bar search failed", err));
    return () => controller.abort();
  }, [query, slots]);

  return { groups, settled: settledFor?.query === query && settledFor.slots === slots };
}
