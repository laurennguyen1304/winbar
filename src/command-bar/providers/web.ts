// "Web" group (SPEC-command-bar §5.4), modelled on yasb Quick Launch's web_search provider: "?" lists every
// engine with the preferred one first; without the prefix only the preferred engine shows, and only when nothing
// else matched.
import type { SearchProvider, SearchResult } from "../../shell/widget-contract";
import { openUrl } from "../native";

export type PreferredEngine = "google" | "bing" | "duckduckgo";

interface Engine {
  id: string;
  name: string;
  /** `{}` is replaced by the encoded query. */
  url: string;
  site: string;
}

export const ENGINES: readonly Engine[] = [
  { id: "google", name: "Google", url: "https://www.google.com/search?q={}", site: "google.com" },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q={}", site: "bing.com" },
  { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q={}", site: "duckduckgo.com" },
  { id: "brave", name: "Brave", url: "https://search.brave.com/search?q={}", site: "search.brave.com" },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com/results?search_query={}", site: "youtube.com" },
  { id: "github", name: "GitHub", url: "https://github.com/search?q={}", site: "github.com" },
  { id: "wikipedia", name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search={}", site: "wikipedia.org" },
  { id: "reddit", name: "Reddit", url: "https://www.reddit.com/search/?q={}", site: "reddit.com" },
  { id: "stackoverflow", name: "Stack Overflow", url: "https://stackoverflow.com/search?q={}", site: "stackoverflow.com" },
  { id: "x", name: "X", url: "https://x.com/search?q={}", site: "x.com" },
];

export const searchUrl = (engine: Engine, query: string) => engine.url.replace("{}", encodeURIComponent(query));

/** Preferred engine first, the rest in the order above. */
export function orderedEngines(preferred: PreferredEngine): Engine[] {
  const first = ENGINES.find((e) => e.id === preferred) ?? ENGINES[0];
  return [first, ...ENGINES.filter((e) => e !== first)];
}

export function createWebProvider(
  preferred: () => PreferredEngine,
  open: (url: string) => Promise<void> = openUrl,
): SearchProvider {
  return {
    id: "web",
    title: "Web",
    prefix: "?",
    search(query) {
      const engines = orderedEngines(preferred());
      const text = query.trim();
      if (!text) {
        const hint: SearchResult = {
          id: "web-hint",
          title: `Tìm trên ${engines[0].name}…`,
          subtitle: "Gõ từ khóa sau dấu ?",
          icon: "globe",
          verb: "",
          remember: false,
          run: () => {},
        };
        return Promise.resolve([hint]);
      }
      return Promise.resolve(
        engines.map((engine) => ({
          id: engine.id,
          title: `Tìm "${text}" trên ${engine.name}`,
          subtitle: engine.site,
          icon: "globe",
          verb: "Mở",
          remember: false,
          run: () => open(searchUrl(engine, text)),
        })),
      );
    },
  };
}
