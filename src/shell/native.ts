import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Size } from "./notch-sizes";
import type { Settings } from "./settings";

/** Asks Rust to size the native notch window to `size` and place it `topGap` px below the top of the primary monitor. */
export async function requestNotchLayout(size: Size, topGap: number): Promise<void> {
  if (!isTauri()) return; // plain browser / tests
  await invoke("notch_layout", { width: size.width, height: size.height, topGap });
}

/** Calls `onBlur` when the notch window loses focus (the user clicked somewhere else). Returns an unsubscribe. */
export function onWindowBlur(onBlur: () => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  getCurrentWindow()
    .onFocusChanged(({ payload: focused }) => {
      if (!focused) onBlur();
    })
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("onFocusChanged failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

// ---------------------------------------------------------------- settings (src-tauri/src/settings.rs)

export async function loadSettings(): Promise<Settings | undefined> {
  if (!isTauri()) return undefined;
  return invoke<Settings>("get_settings");
}

/** Rust validates and stores the settings, broadcasts `settings-changed`, and returns what was stored. */
export async function saveSettings(settings: Settings): Promise<Settings | undefined> {
  if (!isTauri()) return undefined;
  return invoke<Settings>("update_settings", { settings });
}

export function onSettingsChanged(handler: (settings: Settings) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<Settings>("settings-changed", (e) => handler(e.payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("listen settings-changed failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

// ---------------------------------------------------------------- windows

/** Opens the Settings window, or focuses it if it is already open. */
export async function openSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_settings");
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  await invoke("quit_app");
}
