import { invoke, isTauri } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Esc on an empty input: Rust hides the window (src-tauri/src/command_bar/mod.rs). */
export async function hideCommandBar(): Promise<void> {
  if (!isTauri()) return;
  await invoke("command_bar_hide");
}

/** Keeps the native window as tall as the bar; Rust keeps the top edge where it is. */
export async function resizeCommandBar(height: number, scale?: number): Promise<void> {
  if (!isTauri()) return;
  // `scale` is the page's devicePixelRatio, which includes the Windows text size the monitor's scale leaves out.
  await invoke("command_bar_resize", { height, scale });
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
  /** The screen's scale; with `devicePixelRatio` it turns `maxHeight` into CSS px. */
  scale?: number;
}

/** The hotkey or tray showed the window or brought it forward. */
export function onCommandBarOpened(handler: (opened: Opened) => void): () => void {
  if (!isTauri()) return () => {};
  return subscribe(
    () => getCurrentWebviewWindow().listen<Opened>("command-bar-opened", (e) => handler(e.payload)),
    "listen command-bar-opened",
  );
}

// ---------------------------------------------------------------- history (src-tauri/src/command_bar/history.rs)

export type HistoryKind = "app" | "file" | "folder" | "action";

/** One run to remember. Never includes the typed text. */
export interface HistoryRun {
  kind: HistoryKind;
  /** App id, absolute path, or winbar action id. */
  target: string;
  title: string;
  subtitle: string | null;
}

export interface HistoryEntry extends HistoryRun {
  count: number;
  lastUsed: number;
}

export async function recordRun(run: HistoryRun): Promise<void> {
  if (!isTauri()) return;
  await invoke("history_record", { run });
}

/** Entries that can still run, most useful first, with their frecency. */
export async function historyList(): Promise<Array<[HistoryEntry, number]>> {
  if (!isTauri()) return [];
  return invoke<Array<[HistoryEntry, number]>>("history_list");
}

// ---------------------------------------------------------------- winbar actions (src-tauri/src/command_bar/actions.rs)

export async function openNotch(tab?: "core" | "claude"): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_notch", { tab: tab ?? null });
}

export async function notchHidden(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("notch_hidden");
}

export async function setNotchHidden(hidden: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_notch_hidden", { hidden });
}

export async function openWinbarSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_settings");
}

export async function quitWinbar(): Promise<void> {
  if (!isTauri()) return;
  await invoke("quit_app");
}

// ---------------------------------------------------------------- apps (src-tauri/src/command_bar/apps.rs)

export interface AppEntry {
  /** AppsFolder id: an AUMID or a path-like id. */
  id: string;
  name: string;
  /** Executable behind the Start shortcut; Store apps have none. */
  path: string | null;
}

export async function listApps(): Promise<AppEntry[]> {
  if (!isTauri()) return [];
  return invoke<AppEntry[]>("list_apps");
}

export async function launchApp(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("launch_app", { id });
}

export async function revealApp(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("reveal_app", { id });
}

/** Data URLs for icon specs (src-tauri/src/command_bar/icons.rs), in order; null where there is none. */
export async function shellIcons(specs: string[]): Promise<Array<string | null>> {
  if (!isTauri()) return specs.map(() => null);
  return invoke<Array<string | null>>("shell_icons", { specs });
}

// ---------------------------------------------------------------- files (src-tauri/src/command_bar/files, launch.rs)

export interface FileHit {
  path: string;
  name: string;
  /** Parent folder as breadcrumbs, e.g. "Documents › Reports". */
  location: string;
  folder: boolean;
}

export interface FileSearch {
  generation: number;
  source: "windows" | "everything" | "off";
  hits: FileHit[];
  error: string | null;
}

export async function searchFiles(query: string, generation: number): Promise<FileSearch> {
  if (!isTauri()) return { generation, source: "off", hits: [], error: null };
  return invoke<FileSearch>("search_files", { query, generation });
}

/** Settings › Command bar: which file sources answer now and which one searches would use. */
export interface FileSearchStatus {
  everything: boolean;
  windows: boolean;
  active: "everything" | "windows" | null;
}

export async function getFileSearchStatus(): Promise<FileSearchStatus | undefined> {
  if (!isTauri()) return undefined;
  return invoke<FileSearchStatus>("file_search_status");
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_path", { path });
}

/** A terminal standing in `path`. Rust accepts an existing folder only. */
export async function openTerminal(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_terminal", { path });
}

/** Default browser; Rust accepts http(s) addresses only. */
export async function openUrl(url: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_url", { url });
}

/** Explorer on the containing folder with the item selected. */
export async function revealPath(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("reveal_path", { path });
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
