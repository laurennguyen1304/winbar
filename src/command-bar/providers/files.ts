// "File" group of the command bar (SPEC-command-bar §5.4): a running Everything, else the Windows Search index.
import type { SearchProvider, SearchResult } from "../../shell/widget-contract";
import { history as defaultHistory, type History } from "../history";
import { fileIcon } from "../icons";
import { openPath, revealPath, searchFiles, type FileSearch } from "../native";

/** Wait after the last keystroke before asking the index. */
export const DEBOUNCE_MS = 120;
/** Without a prefix, shorter text would match half the disk. */
export const MIN_CHARS = 2;

export interface FilesNative {
  search(query: string, generation: number): Promise<FileSearch>;
  open(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });

const SOURCE_LABEL: Record<FileSearch["source"], string> = {
  everything: "File · Everything",
  windows: "File · Windows Search",
  off: "File",
};

export function createFilesProvider(
  native: FilesNative = { search: searchFiles, open: openPath, reveal: revealPath },
  history: Pick<History, "record"> = defaultHistory,
): SearchProvider {
  // Rust drops requests older than the newest it has seen. Base the numbers on the clock so a reloaded page
  // never starts below numbers an earlier page already used.
  let generation = 0;
  const nextGeneration = () => (generation = Math.max(generation + 1, Date.now()));
  let source: FileSearch["source"] = "off";
  return {
    id: "files",
    // The group heading names the source that answered last (read when the group is built).
    get title() {
      return SOURCE_LABEL[source];
    },
    prefix: "/f",
    async search(query, signal) {
      // Only reachable as "/f" alone: without the prefix an empty query never reaches providers.
      if (!query.trim()) {
        const hint: SearchResult = {
          id: "files-hint",
          title: "Tìm file và thư mục",
          subtitle: "Gõ tên sau /f · * và ? để khớp mẫu, ví dụ /f *.pdf",
          icon: "file",
          verb: "",
          remember: false,
          run: () => {},
        };
        return [hint];
      }
      if (query.trim().length < MIN_CHARS) return [];
      await wait(DEBOUNCE_MS, signal);
      const response = await native.search(query, nextGeneration());
      if (signal.aborted) return [];
      source = response.source;
      if (response.error) {
        const failure: SearchResult = {
          id: "files-error",
          title: "Không tìm được file",
          subtitle: response.error,
          icon: "warning",
          verb: "",
          remember: false,
          run: () => {},
        };
        return [failure];
      }
      return response.hits.map((hit) => ({
        id: hit.path,
        title: hit.name,
        subtitle: hit.location,
        icon: fileIcon(hit.path, hit.folder),
        verb: "Mở",
        run: () => {
          history.record({ kind: hit.folder ? "folder" : "file", target: hit.path, title: hit.name, subtitle: hit.location });
          return native.open(hit.path);
        },
        runAlt: () => native.reveal(hit.path),
      }));
    },
  };
}
