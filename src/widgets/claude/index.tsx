// Claude widgets (SPEC-claude): `claude-sessions` owns the list and the pill, `claude-usage` the limits.
import type { WidgetDefinition } from "../../shell/widget-contract";
import { ClaudeBackground, ClaudePill } from "./ClaudePill";
import { createClaudeProvider } from "./search";
import { SessionsCard } from "./SessionsCard";
import { USAGE_WIDGET_ID, UsageCard } from "./UsageCard";
import { UsageForecast } from "./UsageForecast";

export const claudeSessionsWidget: WidgetDefinition = {
  id: "claude-sessions",
  tab: "claude",
  title: "Phiên Claude",
  description: "Phiên đang chạy, trạng thái, project",
  Card: SessionsCard,
  layout: { size: "large" },
  Pill: ClaudePill,
  // Hides the widget from the pill while nothing is running, the way media does when nothing is playing.
  Background: ClaudeBackground,
  searchProvider: createClaudeProvider(),
};

export const claudeUsageWidget: WidgetDefinition = {
  id: USAGE_WIDGET_ID,
  tab: "claude",
  title: "Hạn mức",
  description: "Hạn mức 5 giờ và 7 ngày",
  layout: { size: "small" },
  Card: UsageCard,
  Detail: UsageForecast,
};
