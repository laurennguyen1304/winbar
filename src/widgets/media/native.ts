// Rust side of the media widget (SPEC-media §6.2). Outside Tauri (tests, plain browser) there is no media.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface MediaSession {
  /** AppUserModelId of the app (`id#2` for a second session of the same app). */
  id: string;
  appName: string;
}

export interface MediaTrack {
  sessionId: string;
  title: string;
  artist: string;
  album: string;
  /** Changes when the track (or its artwork) changes; key for `media_art`. */
  trackKey: string;
  status: "playing" | "paused" | "stopped" | "other";
  positionMs: number | null;
  /** `null` when the app reports no usable length (livestreams). */
  durationMs: number | null;
  /** When Windows reported `positionMs` (Unix epoch ms). */
  positionAt: number;
  rate: number;
  can: { playPause: boolean; next: boolean; previous: boolean; seek: boolean };
}

export interface MediaState {
  sessions: MediaSession[];
  /** The session shown (Windows' pick or the user's); `null` when nothing has a media session. */
  current: MediaTrack | null;
}

export const EMPTY_MEDIA: MediaState = { sessions: [], current: null };

export async function getMediaState(): Promise<MediaState> {
  if (!isTauri()) return EMPTY_MEDIA;
  return invoke<MediaState>("media_state");
}

/** PNG data URL of the current track's artwork, or `null` when the app has none. */
export async function getMediaArt(trackKey: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("media_art", { trackKey });
}

export type MediaAction = "playPause" | "next" | "previous";

/** Play/pause, next or previous on the shown session; rejects when the app refuses. */
export async function mediaControl(action: MediaAction): Promise<void> {
  if (!isTauri()) return;
  await invoke("media_control", { action });
}

/** Seeks the shown session to `positionMs` from the start of the track. */
export async function mediaSeek(positionMs: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("media_seek", { positionMs: Math.max(0, Math.round(positionMs)) });
}

/** Shows this session instead of Windows' pick; `null` follows Windows again. */
export async function mediaSelect(sessionId: string | null): Promise<void> {
  if (!isTauri()) return;
  await invoke("media_select", { sessionId });
}

export function onMediaChanged(handler: (state: MediaState) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<MediaState>("media-changed", (e) => handler(e.payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("listen media-changed failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}
