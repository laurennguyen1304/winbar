// Claude widgets (SPEC-claude). `claude-sessions` owns the session list; usage joins in Task 4.
import type { WidgetDefinition } from "../../shell/widget-contract";
import { SessionsCard } from "./SessionsCard";

export const claudeSessionsWidget: WidgetDefinition = {
  id: "claude-sessions",
  tab: "claude",
  title: "Phiên Claude",
  description: "Phiên đang chạy, trạng thái, project",
  Card: SessionsCard,
};
