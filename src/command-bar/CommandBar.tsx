import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Icon } from "../shell/Icon";
import { hideCommandBar, onCommandBarOpened, onMoved, resizeCommandBar, saveCommandBarPosition, startDragging } from "./native";
import styles from "./CommandBar.module.css";

/** M11 (SPEC-command-bar §5.5); matches --motion-quick-fade. */
const FADE_MS = 150;
const REDUCED_FADE_MS = 100;
/** A drag is over once the window has not moved for this long. */
const DROP_SETTLE_MS = 300;
/** Pressing the grip without moving never becomes a drag. */
const DRAG_START_TIMEOUT_MS = 1500;

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Keys typed while an IME (UniKey, Windows Vietnamese keyboard) is still composing belong to the IME. */
const composing = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;

function Kbd({ children }: { children: string }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/** Command bar window (SPEC-command-bar §5). Closes only on Esc with an empty input while it has focus. */
export function CommandBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(true);
  const [maxHeight, setMaxHeight] = useState<number | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);

  useEffect(
    () =>
      onCommandBarOpened((opened) => {
        clearTimeout(hideTimer.current);
        setMaxHeight(opened.maxHeight);
        setOpen(true);
        setFocused(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }),
    [],
  );

  // Page focus follows the native window (the Tauri focus event missed the hotkey's set_focus in live tests).
  // Clicking anywhere on the bar, or Alt+Tab back to it, puts the cursor back in the input.
  useEffect(() => {
    const onFocus = () => {
      setFocused(true);
      inputRef.current?.focus();
    };
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(dragTimer.current);
    },
    [],
  );

  // Only moves that follow a press on the grip are saved: Rust also moves the window when it opens.
  useEffect(
    () =>
      onMoved(() => {
        if (!dragging.current) return;
        clearTimeout(dragTimer.current);
        dragTimer.current = setTimeout(() => {
          dragging.current = false;
          saveCommandBarPosition()
            .then((opened) => opened && setMaxHeight(opened.maxHeight))
            .catch((err: unknown) => console.error("command_bar_save_position failed", err));
        }, DROP_SETTLE_MS);
      }),
    [],
  );

  const onGripDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(() => (dragging.current = false), DRAG_START_TIMEOUT_MS);
    startDragging().catch((err: unknown) => console.error("startDragging failed", err));
  };

  // The native window follows the bar's height.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const report = () => {
      const height = Math.ceil(root.getBoundingClientRect().height);
      if (height > 0) resizeCommandBar(height).catch((err: unknown) => console.error("command_bar_resize failed", err));
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(
      () => void hideCommandBar().catch((err: unknown) => console.error("command_bar_hide failed", err)),
      prefersReducedMotion() ? REDUCED_FADE_MS : FADE_MS,
    );
  }, []);

  // Listen on the window: after the window regains focus, DOM focus may not be in the input yet.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (composing(e)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (query) setQuery("");
        else close();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query, close]);

  const clear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={styles.bar}
      data-testid="command-bar"
      data-open={open}
      data-focused={focused}
      style={maxHeight === undefined ? undefined : { maxHeight }}
    >
      <div className={styles.top}>
        <span className={styles.grip} title="Kéo để di chuyển" data-testid="grip" onPointerDown={onGripDown}>
          <Icon name="grip" size={18} />
        </span>
        <span className={styles.searchIcon}>
          <Icon name="search" size={20} />
        </span>
        <input
          ref={inputRef}
          className={styles.input}
          aria-label="Tìm kiếm"
          placeholder="Tìm app, file, clipboard hoặc gõ phép tính…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className={styles.clear} onClick={clear}>
            Xóa
          </button>
        )}
      </div>
      <div className={styles.sep} />
      {query && (
        <>
          <div className={`${styles.body} ${styles.empty}`}>
            Không tìm thấy kết quả. Thử <b className={styles.hint}>f</b> để tìm file hoặc <b className={styles.hint}>=</b>{" "}
            để tính.
          </div>
          <div className={styles.sep} />
        </>
      )}
      <div className={styles.foot}>
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> chọn
        </span>
        <span>
          <Kbd>↵</Kbd> chạy
        </span>
        <span>
          <Kbd>Esc</Kbd> xóa / đóng
        </span>
        <span className={styles.grow} />
        <span>
          <b className={styles.hint}>=</b> tính <b className={styles.hint}>cb</b> clipboard <b className={styles.hint}>f</b> file{" "}
          <b className={styles.hint}>?</b> web
        </span>
      </div>
    </div>
  );
}
