// One Claude store for the whole notch page, so the card and the pill read the same sessions.
import { useSyncExternalStore } from "react";
import {
  extraIcons,
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
}

const EMPTY: ClaudeView = { sessions: [], icons: {}, usage: NO_USAGE };

let view: ClaudeView = EMPTY;
const listeners = new Set<() => void>();
let started = false;

function set(next: ClaudeView) {
  view = next;
  listeners.forEach((l) => l());
}

export function refresh(): Promise<void> {
  return listSessions()
    .then((sessions) => set({ ...view, sessions }))
    .catch((err: unknown) => console.error("claude_sessions failed", err));
}

/** Re-reads the limits. Rust serves a cached answer unless `force` asks for a fresh one. */
export function refreshUsage(force = false): Promise<void> {
  return getUsage(force)
    .then((usage) => set({ ...view, usage }))
    .catch((err: unknown) => console.error("claude_usage failed", err));
}

/** Re-reads the user's icon folder. Called when the panel opens, so a new file shows up without a restart. */
export function refreshIcons(): Promise<void> {
  return extraIcons()
    .then((icons) => set({ ...view, icons }))
    .catch((err: unknown) => console.error("claude_icons failed", err));
}

function start() {
  if (started) return;
  started = true;
  onSessionsChanged(() => void refresh());
  void refresh();
  void refreshIcons();
  void refreshUsage();
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
