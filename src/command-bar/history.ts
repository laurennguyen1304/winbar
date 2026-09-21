// Command bar history (SPEC-command-bar §5.4, Task 9): Rust stores what ran (src-tauri/src/command_bar/history.rs);
// this store feeds "Gần đây" and the frecency bonus used to rank apps and actions. The typed text is never sent.
import { useSyncExternalStore } from "react";
import type { SearchResult } from "../shell/widget-contract";
import { appIcon, fileIcon } from "./icons";
import { historyList, recordRun, type HistoryEntry, type HistoryKind, type HistoryRun } from "./native";

/** Rows shown in "Gần đây". */
export const RECENT_LIMIT = 8;
/** Frecency is capped so a favourite app never jumps above a better name match (tiers are 10 000 apart). */
const MAX_BONUS = 5_000;

export interface HistoryNative {
  record(run: HistoryRun): Promise<void>;
  list(): Promise<Array<[HistoryEntry, number]>>;
}

export function createHistory(native: HistoryNative) {
  let entries: Array<[HistoryEntry, number]> = [];
  const listeners = new Set<() => void>();
  const key = (kind: HistoryKind, target: string) => `${kind}|${target}`;
  let scores = new Map<string, number>();

  const refresh = () =>
    native
      .list()
      .then((list) => {
        entries = list;
        scores = new Map(list.map(([e, score]) => [key(e.kind, e.target), score]));
        listeners.forEach((l) => l());
      })
      .catch((err: unknown) => console.warn("command bar: history unavailable", err));

  return {
    refresh,
    record(run: HistoryRun) {
      native
        .record(run)
        .then(refresh)
        .catch((err: unknown) => console.warn("command bar: history not saved", err));
    },
    /** Added to a row's score: 100 per frecency point, at most 5 000. */
    bonus: (kind: HistoryKind, target: string) => Math.min(MAX_BONUS, Math.round((scores.get(key(kind, target)) ?? 0) * 100)),
    entries: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type History = ReturnType<typeof createHistory>;

export const history = createHistory({ record: recordRun, list: historyList });

export function useHistoryEntries(store: History = history) {
  return useSyncExternalStore(store.subscribe, store.entries);
}

/** How a remembered item runs again. */
export interface RecentRunners {
  launchApp(id: string): Promise<void>;
  openPath(path: string): Promise<void>;
  revealPath(path: string): Promise<void>;
  runAction(id: string): Promise<void>;
}

/** "Gần đây": the most useful remembered items, runnable, recorded again when run. */
export function recentResults(
  entries: ReadonlyArray<[HistoryEntry, number]>,
  runners: RecentRunners,
  store: Pick<History, "record"> = history,
): SearchResult[] {
  return entries.slice(0, RECENT_LIMIT).map(([entry]) => {
    const again = () => store.record({ kind: entry.kind, target: entry.target, title: entry.title, subtitle: entry.subtitle });
    const base = { id: `${entry.kind}|${entry.target}`, title: entry.title, subtitle: entry.subtitle ?? undefined };
    switch (entry.kind) {
      case "app":
        return {
          ...base,
          icon: appIcon(entry.target),
          verb: "Mở",
          run: () => {
            again();
            return runners.launchApp(entry.target);
          },
        };
      case "file":
      case "folder":
        return {
          ...base,
          icon: fileIcon(entry.target, entry.kind === "folder"),
          verb: "Mở",
          run: () => {
            again();
            return runners.openPath(entry.target);
          },
          runAlt: () => runners.revealPath(entry.target),
        };
      case "action":
        return {
          ...base,
          icon: "sparks",
          verb: "Chạy",
          run: () => {
            again();
            return runners.runAction(entry.target);
          },
        };
    }
  });
}
