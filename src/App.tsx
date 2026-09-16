import { useEffect } from "react";
import { Notch } from "./shell/Notch";
import { registry } from "./shell/registry";
import { notchPropsFrom } from "./shell/settings";
import { useSettings } from "./shell/use-settings";

export default function App() {
  const widgets = registry.all();
  const { settings, update } = useSettings(widgets);

  // Dev helper until the Settings window exists (Task 9): __winbar.update({...}) in the devtools console.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __winbar?: unknown };
    w.__winbar = { settings, update };
  }, [settings, update]);

  return <Notch {...notchPropsFrom(settings, widgets)} />;
}
