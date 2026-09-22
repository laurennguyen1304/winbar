import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Size } from "./notch-sizes";
import type { Settings } from "./settings";
import type { TabId } from "./widget-contract";

/**
 * Asks Rust to size the native notch window to `size` and place it `topGap` px below the top of the primary monitor,
 * `offsetX` px right of its centre (kept on screen).
 */
export async function requestNotchLayout(size: Size, topGap: number, offsetX = 0, scale?: number): Promise<void> {
  if (!isTauri()) return; // plain browser / tests
  // `scale` is the page's devicePixelRatio: Rust sizes the window by it rather than by the monitor's scale alone.
  await invoke("notch_layout", { width: size.width, height: size.height, topGap, offsetX, scale });
}

/** Reserves a strip `height` logical px tall across the top of the primary monitor (sticky mode), or frees it. */
export async function requestSticky(height: number | null): Promise<void> {
  if (!isTauri()) return;
  await invoke("notch_sticky", { height });
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

// ---------------------------------------------------------------- tray (src-tauri/src/tray.rs)

/** The tray or the command bar asked to open the notch panel, optionally on a given tab. */
export function onOpenNotchRequested(handler: (tab?: TabId) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<TabId | null>("notch-open-requested", (e) => handler(e.payload ?? undefined))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("listen notch-open-requested failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

// ---------------------------------------------------------------- hotkeys (src-tauri/src/hotkeys.rs)

export interface HotkeyStatus {
  accelerator: string;
  registered: boolean;
  problem: "invalid" | "in-use" | "failed" | null;
  message: string | null;
}

export async function getHotkeyStatus(): Promise<HotkeyStatus | undefined> {
  if (!isTauri()) return undefined;
  return (await invoke<HotkeyStatus | null>("get_hotkey_status")) ?? undefined;
}

/** Registers the stored shortcut again (e.g. after freeing it in another app). */
export async function retryHotkey(): Promise<HotkeyStatus | undefined> {
  if (!isTauri()) return undefined;
  return invoke<HotkeyStatus>("retry_hotkey");
}

export function onHotkeyStatus(handler: (status: HotkeyStatus) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<HotkeyStatus>("hotkey-status", (e) => handler(e.payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("listen hotkey-status failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}
