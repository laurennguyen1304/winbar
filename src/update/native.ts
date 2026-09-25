// Rust side of the update notice (SPEC-update §6). Outside Tauri there is nothing to check.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface UpdateStatus {
  /** The running build, e.g. "0.2.0". */
  current: string;
  /** A newer version on GitHub, when one is known. */
  latest?: string;
  /** The version the pill should announce: newer, and not dismissed yet. */
  pending?: string;
  /** Epoch ms of the last successful check; 0 when there has never been one. */
  checkedAt: number;
  error?: "network";
}

/** What is known already. Never touches the network. */
export async function updateStatus(): Promise<UpdateStatus | null> {
  if (!isTauri()) return null;
  return invoke<UpdateStatus>("update_status");
}

/** Asks GitHub now (the Settings button). */
export async function checkNow(): Promise<UpdateStatus | null> {
  if (!isTauri()) return null;
  return invoke<UpdateStatus>("update_check");
}

/** The user has seen `version`: it is not announced again. */
export async function dismissUpdate(version: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("update_dismiss", { version });
}

/** Opens the CHANGELOG on GitHub. Rust owns the address; nothing is passed down. */
export async function openChangelog(): Promise<void> {
  if (!isTauri()) return;
  await invoke("update_open_changelog");
}

/** Calls `handler` with the version whenever a check finds one worth announcing. Returns an unsubscribe. */
export function onUpdateAvailable(handler: (version: string) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen<string>("update-available", (e) => handler(e.payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("listen update-available failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}
