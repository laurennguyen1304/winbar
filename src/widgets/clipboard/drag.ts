// Dragging an item out to another app (SPEC-clipboard §5.5).
//
// Two different mechanisms, because they are two different things. Text is a plain HTML5 drag, which WebView2 hands
// to Windows on its own. A picture has to arrive as a *file*, and only a Windows `DoDragDrop` with `CF_HDROP` does
// that — WebView2 offers no way to start one, so that half goes through `tauri-plugin-drag` (Task 1).
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { isTauri } from "@tauri-apps/api/core";
import { clipText, type ClipItem } from "./native";

/**
 * Full text of rows the pointer has touched. A `dragstart` handler can only fill the DataTransfer while it runs, so
 * the text has to be here *before* the drag begins — hence the prefetch on hover. The list itself never carries it.
 */
const texts = new Map<string, string>();

/** Rows already asked for, marked before the read starts: the pointer crossing a row fires more than once. */
const asked = new Set<string>();

/** Reads one row's full text ahead of a possible drag. Cheap, and only for the row under the pointer. */
export function prefetchText(item: ClipItem): void {
  if (item.kind === "image" || asked.has(item.id)) return;
  asked.add(item.id);
  clipText(item.id)
    .then((text) => texts.set(item.id, text))
    .catch((err: unknown) => console.error("clipboard_text failed", err));
}

/** Puts the item's text on the drag. Falls back to the preview when the full text has not arrived yet. */
export function fillTextDrag(event: DragEvent, item: ClipItem): boolean {
  if (item.kind === "image" || !event.dataTransfer) return false;
  event.dataTransfer.setData("text/plain", texts.get(item.id) ?? item.preview);
  event.dataTransfer.effectAllowed = "copy";
  return true;
}

/** Starts a Windows file drag for a picture. The thumbnail doubles as the drag preview. */
export function dragPicture(item: ClipItem): Promise<void> {
  if (!isTauri() || !item.image) return Promise.resolve();
  return startDrag({ item: [item.image.path], icon: item.image.thumb });
}

/** What a row does when it starts being dragged: text through the browser, a picture through Windows. */
export function startRowDrag(event: DragEvent, item: ClipItem): void {
  if (item.kind !== "image") {
    fillTextDrag(event, item);
    return;
  }
  // The browser has nothing useful to carry, so stop its drag and start the Windows one.
  event.preventDefault();
  void dragPicture(item).catch((err: unknown) => console.error("startDrag failed", err));
}

/** Tests only. */
export function resetTextsForTests(): void {
  texts.clear();
  asked.clear();
}
