import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_MS, createShell } from "./shell";

const Content = () => null;
const Other = () => null;

describe("opening an alert's own card", () => {
  const card = () => null;
  const withCard = { id: "ask", source: "w", priority: 5, Content: () => null, Detail: card };
  const plain = { id: "note", source: "w", priority: 9, Content: () => null };

  it("asks the notch to open the card of the alert on the pill", () => {
    const shell = createShell();
    const opened: string[] = [];
    shell.bindNotch({ open: () => {}, collapse: () => {}, openDetail: (id) => opened.push(id) });
    shell.api.alerts.push(withCard);
    shell.api.openDetail("ask");
    expect(opened).toEqual(["ask"]);
  });

  it("does nothing for an alert that is not on the pill, has no card, or does not exist", () => {
    const shell = createShell();
    const opened: string[] = [];
    shell.bindNotch({ open: () => {}, collapse: () => {}, openDetail: (id) => opened.push(id) });
    shell.api.openDetail("ask");
    shell.api.alerts.push(withCard);
    // A higher-priority alert takes the pill: the card of the one behind it must not open unseen.
    shell.api.alerts.push(plain);
    shell.api.openDetail("ask");
    shell.api.openDetail("note");
    expect(opened).toEqual([]);
  });

  it("is safe to call before any notch is mounted", () => {
    const shell = createShell();
    shell.api.alerts.push(withCard);
    expect(() => shell.api.openDetail("ask")).not.toThrow();
  });
});

describe("shell runtime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("exposes the current alert and notifies subscribers", () => {
    const shell = createShell();
    const listener = vi.fn();
    shell.subscribe(listener);
    shell.api.alerts.push({ id: "a", source: "demo", priority: 1, Content });
    expect(shell.getSnapshot().alert?.id).toBe("a");
    expect(listener).toHaveBeenCalledOnce();
    shell.api.alerts.dismiss("a");
    expect(shell.getSnapshot().alert).toBeUndefined();
  });

  it("keeps the snapshot stable when nothing changes", () => {
    const shell = createShell();
    const before = shell.getSnapshot();
    shell.api.alerts.dismiss("missing");
    shell.retainSources(new Set());
    expect(shell.getSnapshot()).toBe(before);
  });

  it("hides and shows widgets, notifying only on a change", () => {
    const shell = createShell();
    const listener = vi.fn();
    shell.subscribe(listener);
    expect(shell.getSnapshot().hidden.size).toBe(0);
    shell.api.setHidden("media", true);
    expect([...shell.getSnapshot().hidden]).toEqual(["media"]);
    const hiddenSnapshot = shell.getSnapshot();
    shell.api.setHidden("media", true);
    expect(shell.getSnapshot()).toBe(hiddenSnapshot);
    shell.api.setHidden("media", false);
    expect(shell.getSnapshot().hidden.size).toBe(0);
    shell.api.setHidden("other", false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("flashes pill content for 1.2s", () => {
    const shell = createShell();
    shell.api.flashPill(Content);
    expect(shell.getSnapshot().flash?.Content).toBe(Content);
    vi.advanceTimersByTime(FLASH_MS);
    expect(shell.getSnapshot().flash).toBeUndefined();
  });

  it("restarts the timer when a new flash replaces the current one", () => {
    const shell = createShell();
    shell.api.flashPill(Content);
    vi.advanceTimersByTime(1000);
    shell.api.flashPill(Other);
    vi.advanceTimersByTime(1000);
    expect(shell.getSnapshot().flash?.Content).toBe(Other);
    vi.advanceTimersByTime(200);
    expect(shell.getSnapshot().flash).toBeUndefined();
  });

  it("never covers an alert with a flash", () => {
    const shell = createShell();
    shell.api.alerts.push({ id: "a", source: "demo", priority: 1, Content });
    shell.api.flashPill(Other);
    expect(shell.getSnapshot().flash).toBeUndefined();
  });

  it("drops alerts from disabled widgets", () => {
    const shell = createShell();
    shell.api.alerts.push({ id: "a", source: "media", priority: 1, Content });
    shell.retainSources(new Set(["clipboard"]));
    expect(shell.getSnapshot().alert).toBeUndefined();
  });

  it("forwards panel commands to the mounted notch", () => {
    const shell = createShell();
    const open = vi.fn();
    const collapse = vi.fn();
    shell.api.openPanel("claude"); // nothing bound yet: no-op
    shell.bindNotch({ open, collapse, openDetail: () => {} });
    shell.api.openPanel("claude");
    shell.api.collapse();
    expect(open).toHaveBeenCalledWith("claude");
    expect(collapse).toHaveBeenCalledOnce();
  });
});
