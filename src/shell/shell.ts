// Shell runtime behind ShellApi: alert queue, temporary pill content, and panel commands.
import type { ComponentType } from "react";
import {
  currentAlert,
  dismissAlert,
  pushAlert,
  retainAlertSources,
  type AlertQueue,
  type QueuedAlert,
} from "./alert-queue";
import type { PillAlert, ShellApi, TabId, WidgetId } from "./widget-contract";

export const FLASH_MS = 1200;

export interface ShellSnapshot {
  alert: QueuedAlert | undefined;
  flash: { key: number; Content: ComponentType } | undefined;
  /** Widgets that asked to be hidden (`ShellApi.setHidden`). */
  hidden: ReadonlySet<WidgetId>;
}

export interface NotchControls {
  open(tab?: TabId): void;
  collapse(): void;
}

export interface Shell {
  api: ShellApi;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ShellSnapshot;
  /** Only alerts from these widget ids are kept (called when widgets are enabled/disabled). */
  retainSources(ids: ReadonlySet<string>): void;
  /** The mounted Notch registers how to open/collapse itself. */
  bindNotch(controls: NotchControls | undefined): void;
}

export function createShell(): Shell {
  let queue: AlertQueue = [];
  let seq = 0;
  let flash: ShellSnapshot["flash"];
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let notch: NotchControls | undefined;
  let hidden: ReadonlySet<WidgetId> = new Set();
  let snapshot: ShellSnapshot = { alert: undefined, flash: undefined, hidden };
  const listeners = new Set<() => void>();

  const emit = () => {
    snapshot = { alert: currentAlert(queue), flash, hidden };
    listeners.forEach((l) => l());
  };
  const setQueue = (next: AlertQueue) => {
    if (next === queue) return;
    queue = next;
    emit();
  };

  const api: ShellApi = {
    alerts: {
      push: (alert: PillAlert) => setQueue(pushAlert(queue, alert, seq++)),
      dismiss: (id: string) => setQueue(dismissAlert(queue, id)),
    },
    openPanel: (tab) => notch?.open(tab),
    collapse: () => notch?.collapse(),
    flashPill: (Content, ms = FLASH_MS) => {
      // An alert on the pill is never covered by a flash (SPEC M7).
      if (currentAlert(queue)) return;
      clearTimeout(flashTimer);
      flash = { key: seq++, Content };
      emit();
      flashTimer = setTimeout(() => {
        flash = undefined;
        emit();
      }, ms);
    },
    setHidden: (widgetId, hide) => {
      if (hidden.has(widgetId) === hide) return;
      const next = new Set(hidden);
      if (hide) next.add(widgetId);
      else next.delete(widgetId);
      hidden = next;
      emit();
    },
  };

  return {
    api,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    retainSources: (ids) => setQueue(retainAlertSources(queue, ids)),
    bindNotch(controls) {
      notch = controls;
    },
  };
}
