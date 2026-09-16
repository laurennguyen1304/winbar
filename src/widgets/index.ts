// Every widget registers here; the shell never imports concrete widgets.
import { registerWidget } from "../shell/registry";
import { demoWidgets } from "./demo";

if (import.meta.env.DEV) {
  demoWidgets.forEach(registerWidget);
}
