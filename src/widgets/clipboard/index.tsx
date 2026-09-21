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
  // Out of the notch, into the command bar (the owner, 21/09): Ctrl+Space shows it under the search box. The
  // widget stays enabled, so its search provider and the "Đã copy" flash still work.
  layout: { size: "medium", inPanel: false },
  CommandBarBlock: ClipboardCard,
  searchProvider: createClipboardProvider(),
};
