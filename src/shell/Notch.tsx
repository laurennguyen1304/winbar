import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Panel } from "./Panel";
import { registry } from "./registry";
import type { TabId, WidgetDefinition } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
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
  panelHeight,
  pillRadius,
  type Size,
} from "./notch-sizes";
import { useNotchMachine } from "./use-notch-machine";
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

export function Notch({
  widgets = registry.all(),
  mode = "hover",
  pillSize = PILL_SIZES.m,
  alwaysSize = ALWAYS_SIZES.m,
  panelWidth = PANEL_WIDTHS.m,
  topGap = DEFAULT_TOP_GAP,
}: NotchProps) {
  const { visual, dispatch } = useNotchMachine(mode);
  const expanded = visual === "expanded";
  const [tab, setTab] = useState<TabId>("core");
  // Until Settings (Task 8) the pill shows the first widget that provides pill content.
  const priority = widgets.find((w) => w.Pill);

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

  const collapsed = visual === "always" || (expanded && mode === "always") ? alwaysSize : pillSize;
  const panel: Size = { width: panelWidth, height: panelHeight(contentHeight, window.screen.height) };
  const block = expanded ? panel : collapsed;
  const radius = expanded ? PANEL_RADIUS : pillRadius(collapsed);

  // Native window: grow to the target before the CSS morph; shrink only after the morph finishes (SPEC R2).
  const firstLayout = useRef(true);
  useEffect(() => {
    const target = expanded ? panel : collapsed;
    const delay = expanded || firstLayout.current || prefersReducedMotion() ? 0 : RESIZE_MS;
    firstLayout.current = false;
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "close", reason: "escape" });
    };
    window.addEventListener("keydown", onKey);
    const unlisten = onWindowBlur(() => dispatch({ type: "close", reason: "clickOutside" }));
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten();
    };
  }, [expanded, dispatch]);

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
          <button type="button" className={styles.pill} onClick={() => dispatch({ type: "clickPill" })}>
            {priority?.Pill ? (
              <WidgetBoundary title={priority.title} fallback={defaultPill}>
                <priority.Pill />
              </WidgetBoundary>
            ) : (
              defaultPill
            )}
          </button>
        )}
      </div>
    </div>
  );
}
