// "Ứng dụng" group (SPEC-command-bar §5.4): Start menu apps listed by Rust, ranked here by name.
import type { SearchProvider } from "../../shell/widget-contract";
import { history as defaultHistory, type History } from "../history";
import { appIcon } from "../icons";
import { launchApp, listApps, revealApp, type AppEntry } from "../native";
import { rankNames } from "../rank";

/** The list changes rarely; Rust refreshes it on its own when it is older than 10 minutes. */
export const LIST_TTL_MS = 60_000;

export interface AppsNative {
  list(): Promise<AppEntry[]>;
  launch(id: string): Promise<void>;
  reveal(id: string): Promise<void>;
}

export function createAppsProvider(
  native: AppsNative = { list: listApps, launch: launchApp, reveal: revealApp },
  now: () => number = Date.now,
  history: Pick<History, "record" | "bonus"> = defaultHistory,
): SearchProvider {
  let cache: { at: number; apps: Promise<AppEntry[]> } | undefined;
  const apps = () => {
    if (!cache || now() - cache.at > LIST_TTL_MS) {
      const loading = native.list().catch((err: unknown) => {
        cache = undefined;
        throw err;
      });
      cache = { at: now(), apps: loading };
    }
    return cache.apps;
  };

  return {
    id: "apps",
    title: "Ứng dụng",
    async search(query) {
      const ranked = rankNames(query, await apps(), (a) => a.name);
      return ranked.map(({ item, score }) => ({
        id: item.id,
        title: item.name,
        subtitle: "Ứng dụng",
        icon: appIcon(item.id),
        verb: "Mở",
        // Often-used apps first among equally good name matches.
        score: score + history.bonus("app", item.id),
        run: () => {
          history.record({ kind: "app", target: item.id, title: item.name, subtitle: "Ứng dụng" });
          return native.launch(item.id);
        },
        ...(item.path ? { runAlt: () => native.reveal(item.id) } : {}),
      }));
    },
  };
}
