// Pure pill alert queue (SPEC §6): highest priority first, ties by arrival; same id replaces in place.
import type { PillAlert } from "./widget-contract";

export interface QueuedAlert extends PillAlert {
  /** Arrival order; kept when an alert is replaced so it does not lose its place. */
  seq: number;
}

export type AlertQueue = readonly QueuedAlert[];

export function pushAlert(queue: AlertQueue, alert: PillAlert, seq: number): AlertQueue {
  const existing = queue.find((a) => a.id === alert.id);
  if (!existing) return [...queue, { ...alert, seq }];
  return queue.map((a) => (a.id === alert.id ? { ...alert, seq: existing.seq } : a));
}

export function dismissAlert(queue: AlertQueue, id: string): AlertQueue {
  return queue.some((a) => a.id === id) ? queue.filter((a) => a.id !== id) : queue;
}

/** Removes alerts raised by widgets that are no longer enabled. */
export function retainAlertSources(queue: AlertQueue, enabled: ReadonlySet<string>): AlertQueue {
  return queue.every((a) => enabled.has(a.source)) ? queue : queue.filter((a) => enabled.has(a.source));
}

export function currentAlert(queue: AlertQueue): QueuedAlert | undefined {
  let best: QueuedAlert | undefined;
  for (const a of queue) {
    if (!best || a.priority > best.priority || (a.priority === best.priority && a.seq < best.seq)) best = a;
  }
  return best;
}
