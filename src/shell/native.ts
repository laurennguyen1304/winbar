import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Size } from "./notch-sizes";

/** Asks Rust to size the native notch window to `size` and place it `topGap` px below the top of the primary monitor. */
export async function requestNotchLayout(size: Size, topGap: number): Promise<void> {
  if (!isTauri()) return; // plain browser / tests
  await invoke("notch_layout", { width: size.width, height: size.height, topGap });
}
