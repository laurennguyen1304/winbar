// Clipboard widget (SPEC-clipboard): the last copies of the day, searchable and pinnable.
import type { WidgetDefinition } from "../../shell/widget-contract";
import { ClipboardCard } from "./ClipboardCard";
import { createClipboardProvider } from "./search";

export const clipboardWidget: WidgetDefinition = {
  id: "clipboard",
  tab: "core",
  title: "Clipboard",
  description: "Lịch sử, tìm kiếm, ảnh",
  Card: ClipboardCard,
  // The list needs the height, so it takes a column of its own (SPEC-notch-shell §6).
  layout: { tall: true },
  searchProvider: createClipboardProvider(),
};
