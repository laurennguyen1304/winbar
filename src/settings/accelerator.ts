// Turns a keydown into a shortcut string that src-tauri/src/hotkeys.rs (global-hotkey) can parse.

export type RecordResult =
  | { kind: "done"; accelerator: string }
  | { kind: "waiting" }
  | { kind: "cancel" }
  | { kind: "invalid"; reason: string };

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

const NAMED: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backquote: "Backquote",
  Minus: "Minus",
  Equal: "Equal",
  BracketLeft: "BracketLeft",
  BracketRight: "BracketRight",
  Backslash: "Backslash",
  Semicolon: "Semicolon",
  Quote: "Quote",
  Comma: "Comma",
  Period: "Period",
  Slash: "Slash",
};

function keyName(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED[code];
}

export function acceleratorFromKey(e: KeyLike): RecordResult {
  if (e.code === "Escape") return { kind: "cancel" };
  if (MODIFIER_CODES.test(e.code)) return { kind: "waiting" };
  const name = keyName(e.code);
  if (!name) return { kind: "invalid", reason: "Phím này chưa được hỗ trợ" };
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(
    (m): m is string => Boolean(m),
  );
  if (mods.length === 0 && !/^F\d+$/.test(name)) {
    return { kind: "invalid", reason: "Cần ít nhất một phím Ctrl, Alt, Shift hoặc Win" };
  }
  return { kind: "done", accelerator: [...mods, name].join("+") };
}
