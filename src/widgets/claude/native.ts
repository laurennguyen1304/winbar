// Rust side of the Claude widgets (SPEC-claude §6). Outside Tauri there are no sessions and no usage.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ClaudePhase = "idle" | "thinking" | "tool" | "permission";

export interface ClaudeSession {
  id: string;
  /** Where it came from. `history` is a past Desktop session, not something running. */
  source: "cli" | "desktop" | "history";
  /** Worktree name inside Orca, otherwise the folder name, otherwise a Desktop session title. */
  title: string;
  /** The project a worktree belongs to (SPEC §3.4). Absent outside Orca. */
  project?: string;
  phase: ClaudePhase;
  /** Tool name while `phase` is `tool`. */
  tool?: string;
  cwd?: string;
  /** Epoch ms. Absent for most sessions: the hook records 0. */
  startedAt?: number;
  /** Epoch ms of the last sign of life. */
  lastActiveAt: number;
  /** Completed turns, for a Desktop history row. */
  turns?: number;
  /** Quiet long enough that it is probably forgotten, or was never closed cleanly. */
  stale?: boolean;
}

export interface ClaudeWindow {
  /** 0–100, rounded. */
  percent: number;
  /** ISO 8601. */
  resetsAt?: string;
}

export type UsageError = "auth" | "network" | "no-login";

export interface ClaudeUsage {
  fiveHour?: ClaudeWindow;
  sevenDay?: ClaudeWindow;
  /** Weekly limits scoped to one model, e.g. "Fable 10%". */
  perModel: Array<{ label: string; percent: number }>;
  /** Epoch ms of the last successful fetch; 0 when there has never been one. */
  fetchedAt: number;
  error?: UsageError;
  /** Every account an account-switcher CLI manages (SPEC §3.3b). The fields above are the active account's. */
  accounts?: ClaudeAccountUsage[];
}

export interface ClaudeAccountUsage {
  id: string;
  /** Alias, or a masked email. Never a full email. */
  label: string;
  active: boolean;
  fiveHour?: ClaudeWindow;
  sevenDay?: ClaudeWindow;
  /** Epoch ms of the CLI's last poll for this account; 0 when unknown. */
  fetchedAt: number;
  needsLogin: boolean;
}

export const NO_USAGE: ClaudeUsage = { perModel: [], fetchedAt: 0 };

export async function listSessions(): Promise<ClaudeSession[]> {
  if (!isTauri()) return [];
  return invoke<ClaudeSession[]>("claude_sessions");
}

/** Every account's usage from an account-switcher CLI; `null` when there is none (SPEC §3.3b). Can take seconds. */
export async function getAccounts(force = false): Promise<ClaudeAccountUsage[] | null> {
  if (!isTauri()) return null;
  return invoke<ClaudeAccountUsage[] | null>("claude_accounts", { force });
}

export async function getUsage(force = false): Promise<ClaudeUsage> {
  if (!isTauri()) return NO_USAGE;
  return invoke<ClaudeUsage>("claude_usage", { force });
}

/** Extra status images per phase, as data URLs. The bundled ones live in the page, not here. */
/** Brings Claude Desktop to the front. Rust uses the app's own `claude://` protocol. */
export async function openDesktop(): Promise<void> {
  if (!isTauri()) return;
  await invoke("claude_open_desktop");
}

export async function extraIcons(): Promise<Record<string, string[]>> {
  if (!isTauri()) return {};
  return invoke<Record<string, string[]>>("claude_icons");
}

/** Calls `handler` whenever the live session list changes. Returns an unsubscribe function. */
export function onSessionsChanged(handler: () => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen("claude-sessions-changed", () => handler())
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("listen claude-sessions-changed failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}
