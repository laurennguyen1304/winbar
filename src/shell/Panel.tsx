import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { bentoLayout } from "./layout";
import type { WidgetDefinition } from "./widget-contract";
import { WidgetBoundary } from "./WidgetBoundary";
import styles from "./Panel.module.css";

interface PanelProps {
  /** Enabled widgets, in Settings order. */
  widgets: WidgetDefinition[];
  onCollapse(): void;
  onOpenSettings?(): void;
}

/**
 * The open panel: every enabled widget at once, in one bento (SPEC-notch-shell §6).
 *
 * There used to be a Core tab and a Claude tab. The owner asked for them merged on 20/09 — with the sessions
 * list trimmed to what is running, everything worth seeing fits in one view, and a tab that hides half of it
 * is one click between you and the thing you opened the notch for.
 */
export function Panel({ widgets, onCollapse, onOpenSettings }: PanelProps) {
  return (
    <>
      <div className={styles.header}>
        <span className={styles.grow} />
        {onOpenSettings && (
          <button type="button" className={styles.iconButton} aria-label="Cài đặt" onClick={onOpenSettings}>
            <Icon name="settings" size={16} />
          </button>
        )}
        <button type="button" className={styles.iconButton} aria-label="Thu gọn" onClick={onCollapse}>
          <Icon name="collapse" size={16} />
        </button>
      </div>
      <div className={styles.body} role="group">
        <Bento widgets={widgets} />
      </div>
    </>
  );
}

function Bento({ widgets }: { widgets: WidgetDefinition[] }) {
  const layout = bentoLayout(widgets);
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const card = (id: string): ReactNode => {
    const def = byId.get(id);
    if (!def) return null;
    return (
      <WidgetBoundary key={def.id} title={def.title}>
        <def.Card />
      </WidgetBoundary>
    );
  };

  if (widgets.length === 0) {
    return <div className={styles.empty}>Chưa bật widget nào.</div>;
  }

  return (
    // How many tall and small tiles there are decides how the row is split; CSS cannot count them on its own.
    <div className={styles.bento} data-large={layout.large.length} data-small={layout.small.length}>
      {layout.large.map((id) => (
        <div key={id} className={styles.large} data-tile="large">
          {card(id)}
        </div>
      ))}
      {layout.small.length > 0 && (
        <div className={styles.smalls} data-tile="small">
          {layout.small.map(card)}
        </div>
      )}
      {layout.medium.map((id) => (
        <div key={id} className={styles.medium} data-tile="medium">
          {card(id)}
        </div>
      ))}
    </div>
  );
}
