// One media store for the whole notch page: Card, Pill, MidPill and Background read the same state and artwork.
import { useSyncExternalStore } from "react";
import { EMPTY_MEDIA, getMediaArt, getMediaState, onMediaChanged, type MediaState } from "./native";

export interface MediaView {
  state: MediaState;
  /** Artwork for `key`: a data URL, or `null` when the app has none. */
  art: { key: string; url: string | null } | undefined;
}

let view: MediaView = { state: EMPTY_MEDIA, art: undefined };
const listeners = new Set<() => void>();
let started = false;
let stop: (() => void) | undefined;

function set(next: MediaView) {
  view = next;
  listeners.forEach((l) => l());
}

function receive(state: MediaState) {
  set({ ...view, state });
  const key = state.current?.trackKey;
  if (key === undefined || view.art?.key === key) return;
  getMediaArt(key)
    .then((url) => {
      // Drop artwork for a track that is no longer shown.
      if (view.state.current?.trackKey === key) set({ ...view, art: { key, url } });
    })
    .catch((err: unknown) => console.error("media_art failed", err));
}

function start() {
  if (started) return;
  started = true;
  let evented = false;
  stop = onMediaChanged((state) => {
    evented = true;
    receive(state);
  });
  getMediaState()
    .then((state) => {
      // An event that arrived meanwhile is newer than this reply.
      if (!evented) receive(state);
    })
    .catch((err: unknown) => console.error("media_state failed", err));
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getView = () => view;

export function useMedia(): MediaView {
  return useSyncExternalStore(subscribe, getView);
}

/** Artwork URL for the shown track: a data URL, `null` (no artwork) or `undefined` (still loading). */
export function artFor(v: MediaView): string | null | undefined {
  const key = v.state.current?.trackKey;
  return key !== undefined && v.art?.key === key ? v.art.url : undefined;
}

/** Shows a seek at once, before the app reports the new position (SPEC-media §5.4). */
export function seekLocally(positionMs: number) {
  const current = view.state.current;
  if (!current) return;
  set({ ...view, state: { ...view.state, current: { ...current, positionMs, positionAt: Date.now() } } });
}

/** Tests: push a state as if Rust sent it. */
export function receiveForTest(state: MediaState) {
  receive(state);
}

/** Tests: back to an empty, unstarted store. */
export function resetMediaStore() {
  stop?.();
  stop = undefined;
  started = false;
  listeners.clear();
  view = { state: EMPTY_MEDIA, art: undefined };
}
