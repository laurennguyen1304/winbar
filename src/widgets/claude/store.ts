// One Claude store for the whole notch page, so the card and the pill read the same sessions.
import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS } from "../../shell/settings";
import { loadSettings, onSettingsChanged } from "../../shell/native";
import {
  extraIcons,
  getAccounts,
  getUsage,
  listSessions,
  onSessionsChanged,
  NO_USAGE,
  type ClaudeSession,
  type ClaudeUsage,
} from "./native";

export interface ClaudeView {
  sessions: ClaudeSession[];
  /** Extra images per phase, added by the user. Empty until the first read. */
  icons: Readonly<Record<string, string[]>>;
  usage: ClaudeUsage;
  /** The Claude part of Settings, so the card and the pill do not each fetch it. */
  options: (typeof DEFAULT_SETTINGS)["claude"];
}

const EMPTY: ClaudeView = {
  sessions: [],
  icons: {},
  usage: NO_USAGE,
  options: DEFAULT_SETTINGS.claude,
};

let view: ClaudeView = EMPTY;
const listeners = new Set<() => void>();
let started = false;

function set(next: ClaudeView) {
  view = next;
  listeners.forEach((l) => l());
}

export function refresh(): Promise<void> {
  return listSessions().then((sessions) => set({ ...view, sessions }));
}

/**
 * Re-reads the limits. Rust serves a cached answer unless `force` asks for a fresh one.
 *
 * The other accounts are asked for alongside, not before: the CLI behind them takes seconds, and the active
 * account's numbers should not wait for it. The promise is the active account's read only; the accounts land
 * whenever they come, and a failure there just keeps the last list.
 */
export function refreshUsage(force = false): Promise<void> {
  Promise.resolve()
    .then(() => getAccounts(force))
    .then((accounts) => set({ ...view, usage: { ...view.usage, accounts: accounts ?? undefined } }))
    .catch((err: unknown) => console.error("claude_accounts failed", err));
  return getUsage(force).then((usage) => set({ ...view, usage: { ...usage, accounts: view.usage.accounts } }));
}

/** Re-reads the user's icon folder. Called when the panel opens, so a new file shows up without a restart. */
export function refreshIcons(): Promise<void> {
  return extraIcons().then((icons) => set({ ...view, icons }));
}

/**
 * Runs `read` and retries a few times if it fails.
 *
 * The page is alive before Rust finishes its setup, so the very first call can land on a command whose state is
 * not managed yet ("state not managed", seen in the dev log at startup). Without a retry the card would sit empty
 * until something else happened to refresh it.
 */
function withRetry(name: string, read: () => Promise<unknown>, attempt = 0): void {
  read().catch((err: unknown) => {
    if (attempt >= 4) {
      console.error(`${name} failed`, err);
      return;
    }
    setTimeout(() => withRetry(name, read, attempt + 1), 250 * (attempt + 1));
  });
}

function start() {
  if (started) return;
  started = true;
  onSessionsChanged(() => withRetry("claude_sessions", refresh));
  onSettingsChanged((settings) => set({ ...view, options: settings.claude }));
  loadSettings()
    .then((settings) => settings && set({ ...view, options: settings.claude }))
    .catch((err: unknown) => console.error("loadSettings failed", err));
  withRetry("claude_sessions", refresh);
  withRetry("claude_icons", refreshIcons);
  withRetry("claude_usage", () => refreshUsage());
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getView = () => view;

export function useClaude(): ClaudeView {
  return useSyncExternalStore(subscribe, getView);
}

/** Tests only: forgets everything so each case starts clean. */
export function resetForTests(): void {
  view = EMPTY;
  started = false;
  listeners.clear();
}
