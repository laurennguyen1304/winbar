import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { onWindowBlur, requestNotchLayout } from "./native";
import type { OpenMode } from "./notch-machine";
import {
  ALWAYS_SIZES,
  DEFAULT_TOP_GAP,
  PANEL_MIN_HEIGHT,
  PANEL_RADIUS,
  PANEL_WIDTHS,
  PILL_SIZES,
  RESIZE_MS,
  alertSize,
  panelHeight,
  pillRadius,
  type Size,
} from "./notch-sizes";
import { Panel } from "./Panel";
import { registry } from "./registry";
import { useShellRuntime } from "./shell-context";
import { useNotchMachine } from "./use-notch-machine";
import type { TabId, WidgetDefinition } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
import styles from "./Notch.module.css";

interface NotchProps {
  /** Enabled widgets in Settings order (defaults to every registered widget until Settings exist). */
  widgets?: WidgetDefinition[];
  mode?: OpenMode;
  pillSize?: Size;
  alwaysSize?: Size;
  panelWidth?: number;
  topGap?: number;
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const defaultPill = (
  <>
    <Icon name="sparks" size={18} />
    <span>winbar</span>
    <span className={styles.grow} />
    <span className={styles.faint}>Ctrl+Space</span>
  </>
);

const brokenAlert = (
  <>
    <Icon name="sparks" size={18} />
    <span>Có việc cần bạn xem</span>
  </>
);

/** Clicks on a widget's own controls (buttons, links, inputs) must not also open the panel. */
const fromControl = (e: MouseEvent | KeyboardEvent) =>
  e.target !== e.currentTarget && (e.target as HTMLElement).closest("button, a, input, select, textarea") !== null;

export function Notch({
  widgets = registry.all(),
  mode = "hover",
  pillSize = PILL_SIZES.m,
  alwaysSize = ALWAYS_SIZES.m,
  panelWidth = PANEL_WIDTHS.m,
  topGap = DEFAULT_TOP_GAP,
}: NotchProps) {
  const { shell, snapshot } = useShellRuntime();
  const { alert, flash } = snapshot;
  const { visual, dispatch } = useNotchMachine(mode, alert !== undefined);
  const expanded = visual === "expanded";
  const [tab, setTab] = useState<TabId>("core");
  // Until Settings (Task 8) the pill shows the first widget that provides pill content.
  const priority = widgets.find((w) => w.Pill);

  // Let widgets open/collapse the panel through ShellApi.
  useEffect(() => {
    shell.bindNotch({
      open: (target) => {
        if (target) setTab(target);
        dispatch({ type: "clickPill" });
      },
      collapse: () => dispatch({ type: "close", reason: "collapseButton" }),
    });
    return () => shell.bindNotch(undefined);
  }, [shell, dispatch]);

  // Alerts from widgets that are no longer enabled go away.
  const enabledIds = widgets.map((w) => w.id).join("\n");
  useEffect(() => {
    shell.retainSources(new Set(enabledIds ? enabledIds.split("\n") : []));
  }, [shell, enabledIds]);

  // Panel height follows its content.
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(PANEL_MIN_HEIGHT);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!expanded || !el) return;
    const measure = () => setContentHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  const collapsed =
    visual === "always" || (expanded && mode === "always")
      ? alwaysSize
      : visual === "alert"
        ? alertSize(pillSize)
        : pillSize;
  const panel: Size = { width: panelWidth, height: panelHeight(contentHeight, window.screen.height) };
  const block = expanded ? panel : collapsed;
  const radius = expanded ? PANEL_RADIUS : pillRadius(collapsed);

  // Native window: grow to the target before the CSS morph; shrink only after the morph finishes (SPEC R2).
  const firstLayout = useRef(true);
  const lastTarget = useRef<Size | undefined>(undefined);
  useEffect(() => {
    const target = expanded ? panel : collapsed;
    const growing =
      lastTarget.current === undefined ||
      target.width >= lastTarget.current.width ||
      target.height >= lastTarget.current.height;
    const delay = growing || firstLayout.current || prefersReducedMotion() ? 0 : RESIZE_MS;
    firstLayout.current = false;
    lastTarget.current = target;
    const timer = setTimeout(() => {
      requestNotchLayout(target, topGap).catch((err: unknown) => console.error("notch_layout failed", err));
    }, delay);
    return () => clearTimeout(timer);
    // Depend on the numbers, not the object identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, panel.width, panel.height, collapsed.width, collapsed.height, topGap]);

  // Esc and clicks elsewhere close the panel.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "close", reason: "escape" });
    };
    window.addEventListener("keydown", onKey);
    const unlisten = onWindowBlur(() => dispatch({ type: "close", reason: "clickOutside" }));
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten();
    };
  }, [expanded, dispatch]);

  const openFromPill = (e: MouseEvent | KeyboardEvent) => {
    if (fromControl(e)) return;
    if (alert) {
      const source = widgets.find((w) => w.id === alert.source);
      if (source) setTab(source.tab);
    }
    dispatch({ type: "clickPill" });
  };

  let pillContent: ReactNode;
  if (alert) {
    pillContent = (
      <WidgetBoundary key={alert.id} title={alert.source} fallback={brokenAlert}>
        <alert.Content />
      </WidgetBoundary>
    );
  } else if (flash) {
    pillContent = (
      <span key={flash.key} className={styles.flash}>
        <flash.Content />
      </span>
    );
  } else if (priority?.Pill) {
    pillContent = (
      <WidgetBoundary title={priority.title} fallback={defaultPill}>
        <priority.Pill />
      </WidgetBoundary>
    );
  } else {
    pillContent = defaultPill;
  }

  return (
    <div className={styles.stage}>
      <div
        className={styles.notch}
        data-testid="notch"
        data-state={visual}
        style={{ width: block.width, height: block.height, borderRadius: radius }}
        onMouseEnter={() => dispatch({ type: "pointerEnter" })}
        onMouseLeave={() => dispatch({ type: "pointerLeave" })}
      >
        {expanded ? (
          <div className={styles.panel} ref={contentRef} style={{ width: panelWidth }}>
            <Panel
              widgets={widgets}
              tab={tab}
              onTabChange={setTab}
              onCollapse={() => dispatch({ type: "close", reason: "collapseButton" })}
            />
          </div>
        ) : (
          <div
            className={visual === "alert" ? `${styles.pill} ${styles.alert}` : styles.pill}
            role="button"
            tabIndex={0}
            aria-label={alert ? "Thông báo trên pill" : "Mở notch"}
            onClick={openFromPill}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !fromControl(e)) {
                e.preventDefault();
                openFromPill(e);
              }
            }}
          >
            {pillContent}
          </div>
        )}
      </div>

      {/* Widgets' background work keeps running while the panel is closed. */}
      <div hidden>
        {widgets.map(
          (w) =>
            w.Background && (
              <WidgetBoundary key={w.id} title={w.title} fallback={null}>
                <w.Background />
              </WidgetBoundary>
            ),
        )}
      </div>
    </div>
  );
}
