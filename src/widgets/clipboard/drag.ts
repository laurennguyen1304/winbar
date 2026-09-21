// Dragging a picture out to another app (SPEC-clipboard §5.5).
//
// Only pictures. A picture has to arrive as a *file*, and only a Windows `DoDragDrop` with `CF_HDROP` does that —
// WebView2 offers no way to start one, so it goes through `tauri-plugin-drag` (Task 1).
//
// Text used to be offered as a plain HTML5 drag on the theory that WebView2 would hand it to Windows. It does not:
// dragging a text row did nothing at all. The owner does not need it (20/09), so the row no longer pretends. That
// also retired the hover prefetch, which used to read a row's full text into the page just in case a drag began.
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { isTauri } from "@tauri-apps/api/core";
import type { ClipItem } from "./native";

/** Starts a Windows file drag for a picture. The thumbnail doubles as the drag preview. */
export function dragPicture(item: ClipItem): Promise<void> {
  if (!isTauri() || !item.image) return Promise.resolve();
  return startDrag({ item: [item.image.path], icon: item.image.thumb });
}

/** What a picture row does when it starts being dragged. Rows of any other kind are not draggable at all. */
export function startRowDrag(event: DragEvent, item: ClipItem): void {
  if (item.kind !== "image") return;
  // The browser has nothing useful to carry, so stop its drag and start the Windows one.
  event.preventDefault();
  void dragPicture(item).catch((err: unknown) => console.error("startDrag failed", err));
}
