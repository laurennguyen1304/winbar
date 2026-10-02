// Files dropped on the notch (SPEC-claude-drop §5). Rust owns the drop target and the paths; this file only
// hears what to draw and says whether this notch takes drops at all.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export type DropRefusal = "network" | "unsupported" | "file-type" | "too-many" | "missing" | "launch";

/** `names` are the first few file names, already made safe to draw; `count` is how many were dragged. */
export type DropEvent =
  | { kind: "enter"; names: string[]; count: number; refused?: DropRefusal }
  | { kind: "leave" }
  | { kind: "opened"; names: string[]; count: number }
  | { kind: "failed"; reason: DropRefusal };

/**
 * Tells Rust this notch takes drops (or no longer does) and has it attach the drop target. Worth calling again
 * a moment after the page loads: the window Windows hands a drag to is created late (SPEC §2).
 */
export async function armDrop(armed: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("claude_drop_arm", { armed });
}

/** Calls `handler` for every drag over this notch. Returns an unsubscribe function. */
export function onDrop(handler: (event: DropEvent) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  // This window's events only: each notch has its own drop target.
  getCurrentWebview()
    .listen<DropEvent>("claude-drop", (event) => handler(event.payload))
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error("listen claude-drop failed", err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}
