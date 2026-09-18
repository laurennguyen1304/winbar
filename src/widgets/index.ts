// Every widget registers here; the shell never imports concrete widgets.
import { registerWidget } from "../shell/registry";
import { claudeSessionsWidget, claudeUsageWidget } from "./claude";
import { clipboardWidget } from "./clipboard";
import { demoWidgets } from "./demo";
import { mediaWidget } from "./media";
import { systemWidget } from "./system";

registerWidget(mediaWidget);
registerWidget(systemWidget);
registerWidget(clipboardWidget);
registerWidget(claudeSessionsWidget);
registerWidget(claudeUsageWidget);

if (import.meta.env.DEV) {
  demoWidgets.forEach(registerWidget);
}
