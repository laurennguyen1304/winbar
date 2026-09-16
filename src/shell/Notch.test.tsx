import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notch } from "./Notch";
import { PILL_SIZES, RESIZE_MS } from "./notch-sizes";

const { requestNotchLayout, blurHandlers } = vi.hoisted(() => ({
  requestNotchLayout: vi.fn(() => Promise.resolve()),
  blurHandlers: [] as Array<() => void>,
}));
vi.mock("./native", () => ({
  requestNotchLayout,
  onWindowBlur: (cb: () => void) => {
    blurHandlers.push(cb);
    return () => blurHandlers.splice(blurHandlers.indexOf(cb), 1);
  },
}));

const notch = () => screen.getByTestId("notch");
const lastLayout = () => requestNotchLayout.mock.calls.at(-1) as unknown as [{ width: number; height: number }, number];
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Notch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestNotchLayout.mockClear();
    blurHandlers.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("starts as a 340x40 pill, 8px from the top, with fully rounded ends", () => {
    render(<Notch />);
    tick(0);
    expect(notch()).toHaveAttribute("data-state", "pill");
    expect(notch()).toHaveStyle({ width: "340px", height: "40px", borderRadius: "20px" });
    expect(lastLayout()).toEqual([{ width: 340, height: 40 }, 8]);
  });

  it("hover mode: opens after 250ms and grows the native window before the morph", () => {
    render(<Notch />);
    tick(0);
    fireEvent.mouseEnter(notch());
    tick(249);
    expect(notch()).toHaveAttribute("data-state", "pill");
    tick(1);
    expect(notch()).toHaveAttribute("data-state", "expanded");
    tick(0);
    expect(lastLayout()[0].width).toBe(780);
  });

  it("hover mode: closes on leave and shrinks the native window only after the morph", () => {
    render(<Notch />);
    fireEvent.mouseEnter(notch());
    tick(250);
    requestNotchLayout.mockClear();
    fireEvent.mouseLeave(notch());
    expect(notch()).toHaveAttribute("data-state", "pill");
    tick(RESIZE_MS - 1);
    expect(requestNotchLayout).not.toHaveBeenCalled();
    tick(1);
    expect(lastLayout()).toEqual([{ width: 340, height: 40 }, 8]);
  });

  it("click mode: ignores hover, opens on click, closes with Escape", () => {
    render(<Notch mode="click" />);
    fireEvent.mouseEnter(notch());
    tick(500);
    expect(notch()).toHaveAttribute("data-state", "pill");
    fireEvent.click(screen.getByRole("button"));
    expect(notch()).toHaveAttribute("data-state", "expanded");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(notch()).toHaveAttribute("data-state", "pill");
  });

  it("click mode: closes with the collapse button and when the window loses focus", () => {
    render(<Notch mode="click" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));
    expect(notch()).toHaveAttribute("data-state", "pill");

    fireEvent.click(screen.getByRole("button"));
    expect(blurHandlers).toHaveLength(1);
    act(() => blurHandlers[0]());
    expect(notch()).toHaveAttribute("data-state", "pill");
  });

  it("always mode: shows the larger pill and ignores hover", () => {
    render(<Notch mode="always" />);
    tick(0);
    fireEvent.mouseEnter(notch());
    tick(500);
    expect(notch()).toHaveAttribute("data-state", "always");
    expect(notch()).toHaveStyle({ width: "620px", height: "64px", borderRadius: "32px" });
  });

  it("uses the requested pill size and gap", () => {
    render(<Notch pillSize={PILL_SIZES.l} topGap={40} />);
    tick(0);
    expect(lastLayout()).toEqual([{ width: 400, height: 46 }, 40]);
  });
});
