// One clipboard store for the whole notch page, so the card and any future pill read the same list.
import { useSyncExternalStore } from "react";
import {
  clipboardStatus,
  clipThumb,
  listClips,
  onClipboardChanged,
  onClipboardSkipped,
  type ClipItem,
  type SkipReason,
} from "./native";

export interface ClipboardView {
  items: ClipItem[];
  paused: boolean;
  /** The last copy that was turned away, kept only long enough for the card to say so. */
  skipped: { reason: SkipReason; at: number } | undefined;
  /** Thumbnails by item id, fetched one at a time as rows appear. */
  thumbs: Readonly<Record<string, string>>;
}

const EMPTY: ClipboardView = { items: [], paused: false, skipped: undefined, thumbs: {} };

let view: ClipboardView = EMPTY;
const listeners = new Set<() => void>();
let started = false;

function set(next: ClipboardView) {
  view = next;
  listeners.forEach((l) => l());
}

/** Re-reads the list and the pause switch from Rust. */
export function refresh(): Promise<void> {
  return Promise.all([listClips(), clipboardStatus()])
    .then(([items, status]) => set({ ...view, items, paused: status.paused }))
    .catch((err: unknown) => console.error("clipboard_list failed", err));
}

/** Ids already asked for, so a row that re-renders does not fetch its picture again. */
const asked = new Set<string>();

/** Fetches one row's thumbnail if it is not here yet. */
export function requestThumb(id: string): void {
  if (asked.has(id)) return;
  asked.add(id);
  clipThumb(id)
    .then((url) => set({ ...view, thumbs: { ...view.thumbs, [id]: url } }))
    .catch((err: unknown) => console.error("clipboard_thumb failed", err));
}

/** Drops the "skipped" note once the card has shown it. */
export function clearSkipped(): void {
  if (view.skipped) set({ ...view, skipped: undefined });
}

function start() {
  if (started) return;
  started = true;
  onClipboardChanged(() => void refresh());
  onClipboardSkipped((reason) => set({ ...view, skipped: { reason, at: Date.now() } }));
  void refresh();
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getView = () => view;

export function useClipboard(): ClipboardView {
  return useSyncExternalStore(subscribe, getView);
}

/** Tests only: forgets everything so each case starts clean. */
export function resetForTests(): void {
  view = EMPTY;
  started = false;
  listeners.clear();
  asked.clear();
}
