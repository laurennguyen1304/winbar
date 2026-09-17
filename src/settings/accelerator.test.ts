import { describe, expect, it } from "vitest";
import { acceleratorFromKey } from "./accelerator";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("acceleratorFromKey", () => {
  it("builds the text Rust parses, modifiers first in a fixed order", () => {
    expect(acceleratorFromKey(key("Space", { ctrlKey: true }))).toEqual({ kind: "done", accelerator: "Ctrl+Space" });
    expect(acceleratorFromKey(key("KeyK", { shiftKey: true, ctrlKey: true, altKey: true }))).toEqual({
      kind: "done",
      accelerator: "Ctrl+Alt+Shift+K",
    });
    expect(acceleratorFromKey(key("Digit3", { altKey: true }))).toEqual({ kind: "done", accelerator: "Alt+3" });
    expect(acceleratorFromKey(key("ArrowUp", { ctrlKey: true, metaKey: true }))).toEqual({
      kind: "done",
      accelerator: "Ctrl+Super+Up",
    });
  });

  it("allows function keys without a modifier", () => {
    expect(acceleratorFromKey(key("F9"))).toEqual({ kind: "done", accelerator: "F9" });
  });

  it("keeps waiting while only modifiers are held", () => {
    expect(acceleratorFromKey(key("ControlLeft", { ctrlKey: true }))).toEqual({ kind: "waiting" });
    expect(acceleratorFromKey(key("ShiftRight", { shiftKey: true }))).toEqual({ kind: "waiting" });
  });

  it("cancels on Escape and rejects keys that need a modifier", () => {
    expect(acceleratorFromKey(key("Escape"))).toEqual({ kind: "cancel" });
    expect(acceleratorFromKey(key("KeyA"))).toEqual({ kind: "invalid", reason: "Cần ít nhất một phím Ctrl, Alt, Shift hoặc Win" });
    expect(acceleratorFromKey(key("IntlBackslash", { ctrlKey: true }))).toEqual({ kind: "invalid", reason: "Phím này chưa được hỗ trợ" });
  });
});
