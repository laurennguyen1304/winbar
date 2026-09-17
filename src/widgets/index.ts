// Every widget registers here; the shell never imports concrete widgets.
import { registerWidget } from "../shell/registry";
import { demoWidgets } from "./demo";
import { mediaWidget } from "./media";

registerWidget(mediaWidget);

if (import.meta.env.DEV) {
  demoWidgets.forEach(registerWidget);
}
