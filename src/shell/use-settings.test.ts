import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import { useSettings } from "./use-settings";
import type { WidgetDefinition } from "./widget-contract";

const { native } = vi.hoisted(() => ({
  native: {
    stored: undefined as Settings | undefined,
    listeners: [] as Array<(s: Settings) => void>,
    saved: [] as Settings[],
  },
}));

vi.mock("./native", () => ({
  loadSettings: () => Promise.resolve(native.stored),
  saveSettings: (s: Settings) => {
    native.saved.push(s);
    return Promise.resolve(s);
  },
  onSettingsChanged: (handler: (s: Settings) => void) => {
    native.listeners.push(handler);
    return () => native.listeners.splice(native.listeners.indexOf(handler), 1);
  },
}));

const C = () => null;
const registered: WidgetDefinition[] = ["media", "clipboard"].map((id) => ({
  id,
  tab: "core",
  title: id,
  description: "",
  Card: C,
}));

describe("useSettings", () => {
  beforeEach(() => {
    native.stored = undefined;
    native.listeners.length = 0;
    native.saved.length = 0;
  });

  it("uses defaults outside Tauri", async () => {
    const { result } = renderHook(() => useSettings(registered));
    await act(() => Promise.resolve());
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.current.loaded).toBe(true);
    expect(native.saved).toEqual([]);
  });

  it("is not loaded until the stored settings arrive, so the notch never lays out with defaults first", async () => {
    native.stored = { ...DEFAULT_SETTINGS, pill: { ...DEFAULT_SETTINGS.pill, offsetX: -300 } };
    const { result } = renderHook(() => useSettings(registered));
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings.pill.offsetX).toBe(-300);
  });

  it("loads stored settings without rewriting them when the widget list is current", async () => {
    native.stored = {
      ...DEFAULT_SETTINGS,
      fontScale: 110,
      widgets: [
        { id: "clipboard", enabled: false },
        { id: "media", enabled: true },
      ],
    };
    const { result } = renderHook(() => useSettings(registered));
    await waitFor(() => expect(result.current.settings.fontScale).toBe(110));
    expect(native.saved).toEqual([]);
  });

  it("writes back once when widgets were added or removed", async () => {
    native.stored = {
      ...DEFAULT_SETTINGS,
      widgets: [
        { id: "gone", enabled: true },
        { id: "media", enabled: false },
      ],
    };
    const { result } = renderHook(() => useSettings(registered));
    await waitFor(() => expect(native.saved).toHaveLength(1));
    expect(native.saved[0].widgets).toEqual([
      { id: "media", enabled: false },
      { id: "clipboard", enabled: true },
    ]);
    await waitFor(() => expect(result.current.settings.widgets).toEqual(native.saved[0].widgets));
  });

  it("follows settings-changed events from any window", async () => {
    native.stored = {
      ...DEFAULT_SETTINGS,
      widgets: [
        { id: "media", enabled: true },
        { id: "clipboard", enabled: true },
      ],
    };
    const { result } = renderHook(() => useSettings(registered));
    await waitFor(() => expect(native.listeners).toHaveLength(1));
    const next = { ...native.stored, pill: { ...native.stored.pill, openMode: "always" as const } };
    act(() => native.listeners[0](next));
    expect(result.current.settings.pill.openMode).toBe("always");
  });

  it("update() saves through Rust and applies what Rust stored", async () => {
    const { result } = renderHook(() => useSettings(registered));
    const next = { ...DEFAULT_SETTINGS, fontScale: 125 };
    await act(() => result.current.update(next));
    expect(native.saved).toEqual([next]);
    expect(result.current.settings.fontScale).toBe(125);
  });
});
