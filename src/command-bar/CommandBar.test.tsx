import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBar } from "./CommandBar";

const { native } = vi.hoisted(() => ({
  native: {
    hide: vi.fn(() => Promise.resolve()),
    resize: vi.fn(() => Promise.resolve()),
    opened: [] as Array<() => void>,
  },
}));

vi.mock("./native", () => ({
  hideCommandBar: native.hide,
  resizeCommandBar: native.resize,
  onCommandBarOpened: (h: () => void) => {
    native.opened.push(h);
    return () => native.opened.splice(native.opened.indexOf(h), 1);
  },
}));

const input = () => screen.getByRole("textbox", { name: "Tìm kiếm" });
const bar = () => screen.getByTestId("command-bar");
const openBar = () => act(() => native.opened.forEach((h) => h()));
const windowFocus = (focused: boolean) => act(() => void window.dispatchEvent(new Event(focused ? "focus" : "blur")));

describe("CommandBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    native.hide.mockClear();
    native.opened.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("focuses the input and selects the previous text when opened", () => {
    render(<CommandBar />);
    fireEvent.change(input(), { target: { value: "code" } });
    input().blur();
    openBar();
    expect(bar()).toHaveAttribute("data-open", "true");
    expect(input()).toHaveFocus();
    expect((input() as HTMLInputElement).selectionStart).toBe(0);
    expect((input() as HTMLInputElement).selectionEnd).toBe(4);
  });

  it("clears the text on the first Esc and hides after the fade on the second", () => {
    render(<CommandBar />);
    openBar();
    fireEvent.change(input(), { target: { value: "code" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveValue("");
    expect(native.hide).not.toHaveBeenCalled();

    fireEvent.keyDown(input(), { key: "Escape" });
    expect(bar()).toHaveAttribute("data-open", "false");
    expect(native.hide).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(native.hide).toHaveBeenCalledTimes(1);
  });

  it("ignores Esc while an IME is composing Vietnamese text", () => {
    render(<CommandBar />);
    openBar();
    fireEvent.change(input(), { target: { value: "vie" } });
    fireEvent.keyDown(input(), { key: "Escape", isComposing: true });
    fireEvent.keyDown(input(), { key: "Process", keyCode: 229 });
    expect(input()).toHaveValue("vie");
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.keyDown(input(), { key: "Escape", keyCode: 229 });
    act(() => vi.advanceTimersByTime(200));
    expect(native.hide).not.toHaveBeenCalled();
  });

  it("stays open and dims when another app takes focus", () => {
    render(<CommandBar />);
    openBar();
    windowFocus(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(bar()).toHaveAttribute("data-open", "true");
    expect(bar()).toHaveAttribute("data-focused", "false");
    expect(native.hide).not.toHaveBeenCalled();
    openBar();
    expect(bar()).toHaveAttribute("data-focused", "true");
    windowFocus(false);
    windowFocus(true);
    expect(bar()).toHaveAttribute("data-focused", "true");
  });

  it("puts the cursor back in the input when the window regains focus, and Esc works from anywhere", () => {
    render(<CommandBar />);
    openBar();
    fireEvent.change(input(), { target: { value: "code" } });
    windowFocus(false);
    input().blur();
    windowFocus(true);
    expect(input()).toHaveFocus();

    input().blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
  });

  it("opening again during the fade-out cancels the hide", () => {
    render(<CommandBar />);
    openBar();
    fireEvent.keyDown(input(), { key: "Escape" });
    act(() => vi.advanceTimersByTime(50));
    openBar();
    act(() => vi.advanceTimersByTime(500));
    expect(native.hide).not.toHaveBeenCalled();
    expect(bar()).toHaveAttribute("data-open", "true");
  });

  it("clears with the Xóa button and keeps typing focus", () => {
    render(<CommandBar />);
    openBar();
    expect(screen.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "abc" } });
    expect(screen.getByText(/Không tìm thấy kết quả/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
    expect(screen.queryByText(/Không tìm thấy kết quả/)).not.toBeInTheDocument();
  });
});
