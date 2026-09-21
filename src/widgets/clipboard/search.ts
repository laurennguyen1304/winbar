// Clipboard rows in the command bar (SPEC-clipboard §5.6). Runs in the command bar window, so it reads the history
// through Rust, never from the notch's React state.
//
// These rows are never remembered in "Gần đây": what was copied can be private, and a stale row would offer to copy
// something that is no longer in the history.
import { openPath } from "../../command-bar/native";
import { fold } from "../../command-bar/rank";
import type { SearchProvider, SearchResult } from "../../shell/widget-contract";
import { filterClips } from "./filter";
import { copyClip, listClips, type ClipItem } from "./native";

/** Shortest query that gets clipboard rows without a prefix: one letter would match half the history. */
const MIN_QUERY = 2;

/** Newest first, with an earlier match scoring higher. Scores only order rows inside this group. */
function score(item: ClipItem, needle: string, rank: number): number {
  const at = fold(item.preview).indexOf(needle);
  const position = at < 0 ? 0 : Math.max(0, 40 - at);
  // Ten points per row of recency, so a good match can still beat a slightly newer one.
  return 1000 - rank * 10 + position;
}

export function createClipboardProvider(read: () => Promise<ClipItem[]> = listClips): SearchProvider {
  return {
    id: "clipboard",
    title: "Clipboard",
    prefix: "cb",
    async search(query, signal) {
      const trimmed = query.trim();
      const items = await read();
      if (signal.aborted) return [];
      // With the prefix alone the user asked for the history, so show the newest even with nothing typed.
      const browsing = trimmed.length === 0;
      if (!browsing && trimmed.length < MIN_QUERY) return [];

      const needle = fold(trimmed);
      return filterClips(items, "all", trimmed).map((item, rank): SearchResult => {
        const picture = item.kind === "image" ? item.image : undefined;
        return {
          id: `clip-${item.id}`,
          title: item.preview,
          subtitle: [item.app, picture ? "ảnh" : undefined].filter(Boolean).join(" · ") || "Clipboard",
          icon: item.kind,
          verb: "Copy",
          score: browsing ? 1000 - rank * 10 : score(item, needle, rank),
          remember: false,
          run: () => copyClip(item.id),
          runAlt: picture ? () => openPath(picture.path) : undefined,
        };
      });
    },
  };
}
