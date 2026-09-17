import { useCallback, useEffect, useState } from "react";
import { loadSettings, onSettingsChanged, saveSettings } from "./native";
import { DEFAULT_SETTINGS, mergeWidgets, type Settings } from "./settings";
import type { WidgetDefinition } from "./widget-contract";

const sameWidgets = (a: Settings["widgets"], b: Settings["widgets"]) =>
  a.length === b.length && a.every((w, i) => w.id === b[i].id && w.enabled === b[i].enabled);

/**
 * Current settings, live: loaded from Rust on mount and updated on every `settings-changed` event
 * (from this window or the Settings window). New/removed widgets are written back once.
 */
export function useSettings(registered: readonly WidgetDefinition[]) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  /** True once the stored settings were read (or reading failed and the defaults stand). */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const unlisten = onSettingsChanged((next) => active && setSettings(next));
    loadSettings()
      .then((stored) => {
        if (!active) return;
        if (stored) setSettings(stored);
        setLoaded(true);
        if (!stored) return;
        const merged = mergeWidgets(stored.widgets, registered);
        if (sameWidgets(merged, stored.widgets)) return;
        return saveSettings({ ...stored, widgets: merged }).then((saved) => active && saved && setSettings(saved));
      })
      .catch((err: unknown) => {
        console.error("loading settings failed", err);
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
      unlisten();
    };
    // Registered widgets are fixed for the lifetime of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (next: Settings) =>
      saveSettings(next)
        .then((saved) => saved && setSettings(saved))
        .catch((err: unknown) => console.error("saving settings failed", err)),
    [],
  );

  return { settings, loaded, update };
}
