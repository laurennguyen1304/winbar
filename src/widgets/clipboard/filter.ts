// Filtering, searching and the relative time on each row (SPEC-clipboard §5.3). Pure, so all of it is tested.
import { fold } from "../../command-bar/rank";
import type { ClipItem, ClipKind } from "./native";

export type Chip = "all" | ClipKind;

export const CHIPS: ReadonlyArray<{ id: Chip; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "text", label: "Text" },
  { id: "link", label: "Link" },
  { id: "code", label: "Code" },
  { id: "image", label: "Ảnh" },
];

/** Words a picture answers to, so "anh" and "screenshot" find one (SPEC §5.6). */
const IMAGE_WORDS = ["anh", "hinh", "image", "picture", "screenshot", "anh chup"];

/** Everything about an item that a search may match: its preview, its app, and for a picture its size and words. */
function haystack(item: ClipItem): string {
  const parts = [item.preview, item.app ?? ""];
  if (item.image) parts.push(`${item.image.width}x${item.image.height}`, ...IMAGE_WORDS);
  return fold(parts.join(" "));
}

/** Items matching a chip and a query, pinned ones first, then newest first. */
export function filterClips(items: readonly ClipItem[], chip: Chip, query: string): ClipItem[] {
  const needle = fold(query);
  const matches = items.filter(
    (item) => (chip === "all" || item.kind === chip) && (!needle || haystack(item).includes(needle)),
  );
  // A stable sort keeps the store's newest-first order inside each group.
  return matches.sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

/** "vừa xong", "5 phút", "2 giờ", "3 ngày" — short enough for the right edge of a row. */
export function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "vừa xong";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

/** What the list says when it has nothing to show. */
export function emptyMessage(total: number): string {
  return total === 0 ? "Chưa có gì trong clipboard" : "Không có item khớp";
}
