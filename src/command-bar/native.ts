import { invoke, isTauri } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Esc on an empty input: Rust hides the window (src-tauri/src/command_bar/mod.rs). */
export async function hideCommandBar(): Promise<void> {
  if (!isTauri()) return;
  await invoke("command_bar_hide");
}

/** Keeps the native window as tall as the bar; Rust keeps the top edge where it is. */
export async function resizeCommandBar(height: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("command_bar_resize", { height });
}

/** Turns an async Tauri subscription into a synchronous unsubscribe for effects. */
function subscribe(start: () => Promise<UnlistenFn>, what: string): () => void {
  let unlisten: UnlistenFn | undefined;
  let disposed = false;
  start()
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error(`${what} failed`, err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/** The hotkey or tray showed the window or brought it forward. */
export function onCommandBarOpened(handler: () => void): () => void {
  if (!isTauri()) return () => {};
  return subscribe(() => getCurrentWebviewWindow().listen("command-bar-opened", handler), "listen command-bar-opened");
}
