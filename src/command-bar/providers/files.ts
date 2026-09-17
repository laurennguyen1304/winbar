// "File" group of the command bar (SPEC-command-bar §5.4): Windows Search today, Everything in Task 11.
import type { SearchProvider, SearchResult } from "../../shell/widget-contract";
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

export function createFilesProvider(native: FilesNative = { search: searchFiles, open: openPath, reveal: revealPath }): SearchProvider {
  let generation = 0;
  return {
    id: "files",
    title: "File",
    prefix: "f",
    async search(query, signal) {
      if (query.trim().length < MIN_CHARS) return [];
      await wait(DEBOUNCE_MS, signal);
      const response = await native.search(query, ++generation);
      if (signal.aborted) return [];
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
        icon: hit.folder ? "folder" : "file",
        verb: "Mở",
        run: () => native.open(hit.path),
        runAlt: () => native.reveal(hit.path),
      }));
    },
  };
}
