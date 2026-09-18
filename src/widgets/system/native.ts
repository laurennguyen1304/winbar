// Rust side of the system widget (SPEC-system §6). Outside Tauri there are no stats.
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface SystemStats {
  /** 0–100, whole machine, between the last two samples. */
  cpuPercent: number;
  ramUsedBytes: number;
  ramTotalBytes: number;
}

export async function getSystemStats(): Promise<SystemStats | undefined> {
  if (!isTauri()) return undefined;
  return invoke<SystemStats>("system_stats");
}

export async function openTaskManager(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_task_manager");
}
