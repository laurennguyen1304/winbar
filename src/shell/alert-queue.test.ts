import { describe, expect, it } from "vitest";
import { currentAlert, dismissAlert, pushAlert, retainAlertSources, type AlertQueue } from "./alert-queue";
import type { PillAlert } from "./widget-contract";

const Content = () => null;
const alert = (id: string, priority: number, source = "demo"): PillAlert => ({ id, priority, source, Content });

function build(...alerts: PillAlert[]): AlertQueue {
  return alerts.reduce<AlertQueue>((q, a, i) => pushAlert(q, a, i), []);
}

describe("alert queue", () => {
  it("has no current alert when empty", () => {
    expect(currentAlert([])).toBeUndefined();
  });

  it("shows the highest priority first", () => {
    const q = build(alert("low", 1), alert("high", 5), alert("mid", 3));
    expect(currentAlert(q)?.id).toBe("high");
  });

  it("keeps arrival order between equal priorities", () => {
    const q = build(alert("first", 2), alert("second", 2));
    expect(currentAlert(q)?.id).toBe("first");
  });

  it("replaces an alert with the same id without moving it back in line", () => {
    let q = build(alert("a", 2), alert("b", 2));
    const Updated = () => null;
    q = pushAlert(q, { ...alert("a", 2), Content: Updated }, 99);
    expect(q).toHaveLength(2);
    expect(currentAlert(q)?.id).toBe("a");
    expect(currentAlert(q)?.Content).toBe(Updated);
  });

  it("re-sorts when a replacement changes the priority", () => {
    let q = build(alert("a", 1), alert("b", 2));
    q = pushAlert(q, alert("a", 9), 5);
    expect(currentAlert(q)?.id).toBe("a");
  });

  it("dismisses by id and shows the next one", () => {
    const q = dismissAlert(build(alert("a", 5), alert("b", 1)), "a");
    expect(currentAlert(q)?.id).toBe("b");
    expect(dismissAlert(q, "missing")).toBe(q);
  });

  it("drops alerts from widgets that are no longer enabled", () => {
    const q = build(alert("x", 5, "media"), alert("y", 1, "clipboard"));
    const kept = retainAlertSources(q, new Set(["clipboard"]));
    expect(kept.map((a) => a.id)).toEqual(["y"]);
  });
});
