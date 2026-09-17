// Web search (SPEC-command-bar §5.4), modelled on yasb Quick Launch's web_search provider and limited to the four
// sites you asked for (2026-09-17). Each site has its own slash command: /g Google, /y YouTube, /r Reddit, /x X.
// "?" lists all four with the preferred one first; without a command only the preferred site shows, and only when
// nothing else matched.
import type { SearchProvider, SearchResult } from "../../shell/widget-contract";
import { openUrl } from "../native";

export type EngineId = "google" | "youtube" | "reddit" | "x";

export interface Engine {
  id: EngineId;
  name: string;
  /** Typed as "/<command>". */
  command: string;
  /** `{}` is replaced by the encoded query. */
  url: string;
  site: string;
}

export const ENGINES: readonly Engine[] = [
  { id: "google", name: "Google", command: "g", url: "https://www.google.com/search?q={}", site: "google.com" },
  { id: "youtube", name: "YouTube", command: "y", url: "https://www.youtube.com/results?search_query={}", site: "youtube.com" },
  { id: "reddit", name: "Reddit", command: "r", url: "https://www.reddit.com/search/?q={}", site: "reddit.com" },
  { id: "x", name: "X", command: "x", url: "https://x.com/search?q={}", site: "x.com" },
];

export const searchUrl = (engine: Engine, query: string) => engine.url.replace("{}", encodeURIComponent(query));

/** Preferred engine first, the rest in the order above. */
export function orderedEngines(preferred: EngineId): Engine[] {
  const first = ENGINES.find((e) => e.id === preferred) ?? ENGINES[0];
  return [first, ...ENGINES.filter((e) => e !== first)];
}

type Open = (url: string) => Promise<void>;

function rows(engines: readonly Engine[], query: string, open: Open, hint: string): SearchResult[] {
  const text = query.trim();
  if (!text) {
    return [
      {
        id: `web-hint-${engines[0].id}`,
        title: engines.length === 1 ? `Tìm trên ${engines[0].name}…` : "Tìm trên web…",
        subtitle: hint,
        icon: "globe",
        verb: "",
        remember: false,
        run: () => {},
      },
    ];
  }
  return engines.map((engine) => ({
    id: engine.id,
    title: `Tìm "${text}" trên ${engine.name}`,
    subtitle: engine.site,
    icon: "globe",
    verb: "Mở",
    remember: false,
    run: () => open(searchUrl(engine, text)),
  }));
}

/** "?" and the no-results fallback: every engine, the preferred one first. */
export function createWebProvider(preferred: () => EngineId, open: Open = openUrl): SearchProvider {
  return {
    id: "web",
    title: "Web",
    prefix: "?",
    search: (query) =>
      Promise.resolve(rows(orderedEngines(preferred()), query, open, "Gõ từ khóa sau ?, hoặc dùng /g /y /r /x")),
  };
}

/** One engine behind its slash command, e.g. "/y lofi". Never part of results without the command. */
export function createEngineProvider(engine: Engine, open: Open = openUrl): SearchProvider {
  return {
    id: `web-${engine.id}`,
    title: engine.name,
    prefix: `/${engine.command}`,
    inDefaultResults: false,
    search: (query) => Promise.resolve(rows([engine], query, open, `Gõ từ khóa sau /${engine.command}`)),
  };
}
