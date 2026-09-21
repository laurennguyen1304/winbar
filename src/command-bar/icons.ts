// Real app and file icons for result rows (Task 8). Rows name an icon with a spec (`shell:app:<id>`,
// `shell:file:<path>`, `shell:folder:<path>`); tiles ask this store, which batches requests to Rust and remembers
// the answers for the life of the window.
import { useEffect, useSyncExternalStore } from "react";
import { shellIcons } from "./native";

export const SHELL_ICON = "shell:";
export const appIcon = (id: string) => `shell:app:${id}`;
export const fileIcon = (path: string, folder: boolean) => `${folder ? "shell:folder:" : "shell:file:"}${path}`;

/** Rust accepts at most 32 specs per call. */
export const BATCH = 32;

/** `undefined` = not asked yet or on its way; `null` = Windows has no icon for it. */
export type IconValue = string | null | undefined;

export function createIconStore(fetch: (specs: string[]) => Promise<Array<string | null>>) {
  const loaded = new Map<string, string | null>();
  const queued = new Set<string>();
  const listeners = new Set<() => void>();
  let scheduled = false;

  const notify = () => listeners.forEach((l) => l());

  const flush = () => {
    scheduled = false;
    const batch = [...queued].slice(0, BATCH);
    if (batch.length === 0) return;
    batch.forEach((s) => queued.delete(s));
    fetch(batch)
      .then((urls) => batch.forEach((s, i) => loaded.set(s, urls[i] ?? null)))
      .catch((err: unknown) => {
        console.warn("command bar: icons failed", err);
        batch.forEach((s) => loaded.set(s, null));
      })
      .finally(() => {
        notify();
        if (queued.size > 0) schedule();
      });
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(flush, 0);
  };

  return {
    get: (spec: string): IconValue => loaded.get(spec),
    request(spec: string) {
      if (loaded.has(spec) || queued.has(spec)) return;
      queued.add(spec);
      schedule();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type IconStore = ReturnType<typeof createIconStore>;

export const iconStore = createIconStore(shellIcons);

/** The icon's data URL once Rust has drawn it. */
export function useShellIcon(spec: string, store: IconStore = iconStore): IconValue {
  const value = useSyncExternalStore(store.subscribe, () => store.get(spec));
  useEffect(() => store.request(spec), [spec, store]);
  return value;
}
