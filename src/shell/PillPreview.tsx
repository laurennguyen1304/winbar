import { Fragment } from "react";
import { Icon } from "./Icon";
import { pickMidPills, pickPill } from "./pill-content";
import { notchPropsFrom, type Settings } from "./settings";
import type { WidgetDefinition } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
import styles from "./Notch.module.css";

/** Static, non-interactive copy of the collapsed notch for the Settings preview. */
export function PillPreview({
  settings,
  registered,
  variant,
}: {
  settings: Settings;
  registered: readonly WidgetDefinition[];
  variant: "pill" | "always";
}) {
  const props = notchPropsFrom(settings, registered);
  const size = variant === "always" ? props.alwaysSize : props.pillSize;
  let content;
  if (variant === "always") {
    content = pickMidPills(props.widgets, props.priorityWidget).map((w, i) => {
      const Mid = w.MidPill as NonNullable<typeof w.MidPill>;
      return (
        <Fragment key={w.id}>
          {i > 0 && <span className={styles.divider} aria-hidden />}
          <span className={styles.midBlock}>
            <WidgetBoundary title={w.title} fallback={<span>{w.title}</span>}>
              <Mid />
            </WidgetBoundary>
          </span>
        </Fragment>
      );
    });
  } else {
    const w = pickPill(props.widgets, props.priorityWidget);
    content = w?.Pill ? (
      <WidgetBoundary title={w.title} fallback={<span>{w.title}</span>}>
        <w.Pill />
      </WidgetBoundary>
    ) : (
      <>
        <Icon name="sparks" size={18} />
        <span>winbar</span>
      </>
    );
  }

  return (
    <div
      className={styles.notch}
      data-testid={`preview-${variant}`}
      style={{ width: size.width, height: size.height, borderRadius: size.height / 2 }}
      aria-hidden
      inert
    >
      <div
        className={variant === "always" ? `${styles.pill} ${styles.large}` : styles.pill}
        style={{ zoom: props.fontScale, cursor: "default" }}
      >
        {content}
      </div>
    </div>
  );
}
