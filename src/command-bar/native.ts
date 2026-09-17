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

/** Sent by Rust when the bar opens or is saved at a new place (src-tauri/src/command_bar/mod.rs `Opened`). */
export interface Opened {
  /** Logical px the bar may grow to before it leaves its screen. */
  maxHeight: number;
}

/** The hotkey or tray showed the window or brought it forward. */
export function onCommandBarOpened(handler: (opened: Opened) => void): () => void {
  if (!isTauri()) return () => {};
  return subscribe(
    () => getCurrentWebviewWindow().listen<Opened>("command-bar-opened", (e) => handler(e.payload)),
    "listen command-bar-opened",
  );
}

/** Native window drag from the grip. */
export async function startDragging(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWebviewWindow().startDragging();
}

export function onMoved(handler: () => void): () => void {
  if (!isTauri()) return () => {};
  return subscribe(() => getCurrentWebviewWindow().onMoved(() => handler()), "onMoved");
}

/** Rust stores where the window is now as `commandBar.position`. */
export async function saveCommandBarPosition(): Promise<Opened | undefined> {
  if (!isTauri()) return undefined;
  return invoke<Opened>("command_bar_save_position");
}
