// Rust side of installing winbar's Claude Code hooks (SPEC-claude-approvals §4.7). Outside Tauri there is nothing
// to install into.
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface ClaudeHookStatus {
  /** `stale`: winbar's hooks are there, but not the ones this build would write — usually the exe has moved. */
  state: "absent" | "installed" | "stale";
  settingsPath: string;
  /**
   * winbar has its pipe open, so an installed hook has someone to talk to. False when the pipe's name was already
   * taken at startup: the hooks can be there and nothing will ever reach the notch.
   */
  listening: boolean;
}

export interface ClaudeHookPreview {
  /** Changed lines marked `+` and `-`, with a little context. */
  diff: string;
  /** Where the current file is copied first. Empty when there is no file yet. */
  backupPath: string;
  settingsPath: string;
  /** Names the exact file contents this preview was made from; the write is refused if they changed since. */
  fingerprint: string;
  /** When this preview was made, as it appears in the backup's name. Goes back with the write. */
  stamp: string;
  /** The file is laid out differently from how winbar writes JSON: indentation changes beyond what the diff shows. */
  reformats: boolean;
  unchanged: boolean;
}

export async function hookStatus(): Promise<ClaudeHookStatus | null> {
  if (!isTauri()) return null;
  return invoke<ClaudeHookStatus>("claude_hook_status");
}

/** What installing (`true`) or removing (`false`) would change. Writes nothing. */
export async function hookPreview(install: boolean): Promise<ClaudeHookPreview> {
  return invoke<ClaudeHookPreview>("claude_hook_preview", { install });
}

/** Writes what `preview` showed. Resolves to the backup's path, or "" when there was nothing to back up. */
export async function hookApply(install: boolean, preview: ClaudeHookPreview): Promise<string> {
  return invoke<string>("claude_hook_apply", { install, fingerprint: preview.fingerprint, stamp: preview.stamp });
}
