import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Icon } from "../shell/Icon";
import { useSettings } from "../shell/use-settings";
import { WidgetBoundary } from "../shell/WidgetBoundary";
import type { SearchResult, WidgetDefinition } from "../shell/widget-contract";
import {
  hideCommandBar,
  launchApp,
  onCommandBarOpened,
  onMoved,
  openPath,
  resizeCommandBar,
  revealPath,
  saveCommandBarPosition,
  startDragging,
} from "./native";
import { runActionById } from "./providers/actions";
import type { Group } from "./search";
import { copyText } from "./clipboard";
import { history, recentResults, useHistoryEntries } from "./history";
import { calculatorOnly, instantAnswer, type Instant } from "./instant";
import { flattenRows, INSTANT_KEY, InstantBlock, ResultList, type Row } from "./ResultList";
import { allSlots, commandBarBlocks } from "./sources";
import { useCommandSearch } from "./use-command-search";
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

/** Toast on screen (mockup wbToast), then gone. */
const TOAST_MS = 1600;

/** Keys typed while an IME (UniKey, Windows Vietnamese keyboard) is still composing belong to the IME. */
const composing = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;

function Kbd({ children }: { children: string }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/** Runs a result's action; errors are logged, and the command bar stays open (SPEC-command-bar §5.2). */
function runResult(result: SearchResult, alt: boolean) {
  const action = alt ? result.runAlt : result.run;
  if (!action) return;
  Promise.resolve()
    .then(() => action.call(result))
    .catch((err: unknown) => console.error(`command bar: running "${result.id}" failed`, err));
}

/** Command bar window (SPEC-command-bar §5). Closes only on Esc with an empty input while it has focus. */
export function CommandBar({ registered }: { registered: readonly WidgetDefinition[] }) {
  const [query, setQuery] = useState("");
  // undefined = the first row, until the user picks another one.
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(true);
  const [maxHeight, setMaxHeight] = useState<number | undefined>();
  const [toast, setToast] = useState<{ id: number; text: string } | undefined>();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);

  const { settings } = useSettings(registered);
  const slots = useMemo(() => allSlots(settings, registered), [settings, registered]);
  const blocks = useMemo(() => commandBarBlocks(settings.widgets, registered), [settings.widgets, registered]);
  const instant = useMemo(() => instantAnswer(query), [query]);
  const { groups: searchGroups, settled } = useCommandSearch(calculatorOnly(query) ? "" : query, slots);

  // Empty input: "Gần đây" from history (SPEC-command-bar §5.4).
  const historyEntries = useHistoryEntries();
  const groups = useMemo<Group[]>(() => {
    // The web row is a fallback for "nothing matched": a calculation or conversion already answered.
    if (query) return instant ? searchGroups.filter((g) => g.id !== "web") : searchGroups;
    const results = recentResults(historyEntries, { launchApp, openPath, revealPath, runAction: (id) => runActionById(id) });
    return results.length > 0 ? [{ id: "recent", title: "Gần đây", results }] : [];
  }, [query, instant, searchGroups, historyEntries]);

  const copyInstant = useCallback((answer: Instant) => {
    copyText(answer.copy)
      .then(() => {
        clearTimeout(toastTimer.current);
        setToast((t) => ({ id: (t?.id ?? 0) + 1, text: `Đã copy ${answer.copy}` }));
        toastTimer.current = setTimeout(() => setToast(undefined), TOAST_MS);
      })
      .catch((err: unknown) => console.error("copy failed", err));
  }, []);

  // The answer block is the first row; running it copies (handled where rows are run, see onKeyDown).
  const rows = useMemo<Row[]>(() => {
    const instantRow: Row[] = instant
      ? [{ key: INSTANT_KEY, result: { id: INSTANT_KEY, title: instant.display, verb: "Copy", remember: false, run: () => {} } }]
      : [];
    return [...instantRow, ...flattenRows(groups)];
  }, [instant, groups]);
  const selected = Math.max(0, rows.findIndex((r) => r.key === selectedKey));

  // Nothing matched except the web fallback row: say so above it (SPEC-command-bar §5.1).
  const onlyWebFallback =
    !instant && !query.trimStart().startsWith("?") && groups.length > 0 && groups.every((g) => g.id === "web");
  const noResults = (
    <>
      Không tìm thấy kết quả. Thử <b className={styles.hint}>/f</b> để tìm file hoặc <b className={styles.hint}>=</b> để
      tính.
    </>
  );

  const changeQuery = (next: string) => {
    setQuery(next);
    setSelectedKey(undefined);
  };

  useEffect(
    () =>
      onCommandBarOpened((opened) => {
        clearTimeout(hideTimer.current);
        void history.refresh();
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
      clearTimeout(toastTimer.current);
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
        if (query) {
          setQuery("");
          setSelectedKey(undefined);
        } else close();
        inputRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (rows.length === 0) return;
        e.preventDefault();
        const next = Math.min(rows.length - 1, Math.max(0, selected + (e.key === "ArrowDown" ? 1 : -1)));
        setSelectedKey(rows[next].key);
      } else if (e.key === "Enter") {
        const row = rows[selected];
        if (!row) return;
        e.preventDefault();
        if (row.key === INSTANT_KEY && instant) copyInstant(instant);
        else runResult(row.result, e.ctrlKey);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query, close, rows, selected, instant, copyInstant]);

  const clear = () => {
    changeQuery("");
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
          onChange={(e) => changeQuery(e.target.value)}
        />
        {query && (
          <button type="button" className={styles.clear} onClick={clear}>
            Xóa
          </button>
        )}
      </div>
      <div className={styles.sep} />
      {(instant || groups.length > 0) && (
        <>
          <div className={styles.body} role="listbox" aria-label="Kết quả">
            {onlyWebFallback && <div className={styles.empty}>{noResults}</div>}
            {instant && (
              <InstantBlock
                instant={instant}
                selected={rows[selected]?.key === INSTANT_KEY}
                onSelect={() => setSelectedKey(INSTANT_KEY)}
                onCopy={() => copyInstant(instant)}
              />
            )}
            {groups.length > 0 && (
              <ResultList groups={groups} selectedKey={rows[selected]?.key} onSelect={setSelectedKey} onRun={runResult} />
            )}
          </div>
          <div className={styles.sep} />
        </>
      )}
      {query && !instant && groups.length === 0 && settled && (
        <>
          <div className={`${styles.body} ${styles.empty}`}>{noResults}</div>
          <div className={styles.sep} />
        </>
      )}
      {/*
        Widget blocks, only while the input is empty: open Ctrl+Space and the clipboard is right there; start
        typing and they give way to the results, which already carry clipboard items through its provider.
      */}
      {!query && blocks.length > 0 && (
        <>
          <div className={styles.blocks} data-testid="command-bar-blocks">
            {blocks.map(({ id, title, Block }) => (
              <WidgetBoundary key={id} title={title}>
                <Block />
              </WidgetBoundary>
            ))}
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
          <b className={styles.hint}>=</b> tính <b className={styles.hint}>/f</b> file <b className={styles.hint}>/g /y /r /x</b>{" "}
          web
        </span>
      </div>
      {toast && (
        <div key={toast.id} className={styles.toast} role="status">
          <Icon name="check" size={14} />
          {toast.text}
        </div>
      )}
    </div>
  );
}
