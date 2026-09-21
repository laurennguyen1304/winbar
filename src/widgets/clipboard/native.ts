// Rust side of the clipboard widget (SPEC-clipboard §6). Outside Tauri the history is simply empty.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ClipKind = "text" | "link" | "code" | "image";

export interface ClipImage {
  width: number;
  height: number;
  /** The picture as copied; what gets dragged out. */
  path: string;
  /** Small copy for the list. */
  thumb: string;
}

export interface ClipItem {
  id: string;
  kind: ClipKind;
  /** One line, at most 200 characters. */
  preview: string;
  /** When it was copied, epoch ms. */
  at: number;
  pinned: boolean;
  /** Name of the app that copied it, when known. */
  app?: string;
  image?: ClipImage;
  /** The stored text was cut because it was very long. */
  truncated?: boolean;
}

/** Why a copy was not kept (SPEC §5.4). Never carries what was skipped. */
export type SkipReason = "app-flag" | "secret" | "ignored-app" | "paused";

export interface ClipboardStatus {
  paused: boolean;
}

export async function listClips(): Promise<ClipItem[]> {
  if (!isTauri()) return [];
  return invoke<ClipItem[]>("clipboard_list");
}

export async function clipText(id: string): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("clipboard_text", { id });
}

/** One picture's thumbnail as a PNG data URL. */
export async function clipThumb(id: string): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("clipboard_thumb", { id });
}

export async function copyClip(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("clipboard_copy", { id });
}

export async function pinClip(id: string, pinned: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("clipboard_pin", { id, pinned });
}

export async function removeClip(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("clipboard_remove", { id });
}

/** Empties the history except for pinned items; resolves with how many went. */
export async function clearClips(): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("clipboard_clear");
}

export async function pauseClipboard(paused: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("clipboard_pause", { paused });
}

export async function clipboardStatus(): Promise<ClipboardStatus> {
  if (!isTauri()) return { paused: false };
  return invoke<ClipboardStatus>("clipboard_status");
}

/** Calls `handler` whenever the history changes. Returns an unsubscribe function. */
export function onClipboardChanged(handler: () => void): () => void {
  return listenTo("clipboard-changed", handler);
}

/** Calls `handler` when a copy was deliberately not kept. The payload says why, never what. */
export function onClipboardSkipped(handler: (reason: SkipReason) => void): () => void {
  return listenTo<{ reason: SkipReason }>("clipboard-skipped", (payload) => handler(payload.reason));
}

function listenTo<T = unknown>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<T>(event, (e) => handler(e.payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error(`listen ${event} failed`, err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}
