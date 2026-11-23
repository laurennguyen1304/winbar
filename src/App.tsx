import { useEffect } from "react";
import { Notch } from "./shell/Notch";
import { registry } from "./shell/registry";
import { notchPropsFrom, withPillPreview } from "./shell/settings";
import { usePillPreview, useSettings } from "./shell/use-settings";
import { UpdateNotice } from "./update/UpdateNotice";

export default function App() {
  const widgets = registry.all();
  const { settings, loaded, update } = useSettings(widgets);
  // A width slider being dragged in Settings: the notch follows it live, the stored settings stay as they are.
  const preview = usePillPreview();

  // Dev helper until the Settings window exists (Task 9): __winbar.update({...}) in the devtools console.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __winbar?: unknown };
    w.__winbar = { settings, update };
  }, [settings, update]);

  // The window stays hidden until the notch lays it out, so waiting avoids a jump from the default size and spot.
  if (!loaded) return null;
  return (
    <>
      <Notch
        {...notchPropsFrom(withPillPreview(settings, preview), widgets)}
        onOffsetChange={(offsetX) => void update({ ...settings, pill: { ...settings.pill, offsetX } })}
      />
      <UpdateNotice />
    </>
  );
}
