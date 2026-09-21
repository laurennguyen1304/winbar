import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notch } from "./Notch";
import { demoWidgets } from "../widgets/demo";
import { PILL_SIZES, RESIZE_MS } from "./notch-sizes";
import { FLASH_MS, createShell, type Shell } from "./shell";
import { ShellProvider } from "./shell-context";
import type { PillAlert, WidgetDefinition } from "./widget-contract";

const { requestNotchLayout, requestSticky, blurHandlers, trayOpenHandlers } = vi.hoisted(() => ({
  requestNotchLayout: vi.fn(() => Promise.resolve()),
  requestSticky: vi.fn<(height: number | null) => Promise<void>>(() => Promise.resolve()),
  blurHandlers: [] as Array<() => void>,
  trayOpenHandlers: [] as Array<(tab?: "core" | "claude") => void>,
}));
vi.mock("./native", () => ({
  requestNotchLayout,
  requestSticky,
  openSettings: () => Promise.resolve(),
  onOpenNotchRequested: (cb: (tab?: "core" | "claude") => void) => {
    trayOpenHandlers.push(cb);
    return () => trayOpenHandlers.splice(trayOpenHandlers.indexOf(cb), 1);
  },
  onWindowBlur: (cb: () => void) => {
    blurHandlers.push(cb);
    return () => blurHandlers.splice(blurHandlers.indexOf(cb), 1);
  },
}));

const notch = () => screen.getByTestId("notch");
/** The notch's content box; it carries the corner radius (the shape layer draws the background). */
const body = () => notch().children[1] as HTMLElement;
const lastCall = () =>
  requestNotchLayout.mock.calls.at(-1) as unknown as [{ width: number; height: number }, number, number];
const lastLayout = () => lastCall().slice(0, 2) as [{ width: number; height: number }, number];
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Notch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestNotchLayout.mockClear();
    blurHandlers.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("starts as a 340x36 attached notch: flush with the top, window wider by the flares, rounded bottom", () => {
    render(<Notch />);
    tick(0);
    expect(notch()).toHaveAttribute("data-state", "pill");
    expect(notch()).toHaveAttribute("data-layout", "attached");
    expect(notch()).toHaveStyle({ width: "340px", height: "36px" });
    expect(body()).toHaveStyle({ borderRadius: "0 0 18px 18px" });
    expect(lastLayout()).toEqual([{ width: 368, height: 36 }, 0]);
  });

  it("float layout: 8px from the top with fully rounded ends", () => {
    render(<Notch layout="float" material="dense" />);
    tick(0);
    expect(body()).toHaveStyle({ borderRadius: "18px" });
    expect(lastLayout()).toEqual([{ width: 340, height: 36 }, 8]);
    expect(notch().querySelector("[data-material]")).toHaveAttribute("data-material", "dense");
  });

  it("puts the opacity dial behind the material as a fraction, and clamps a silly value", () => {
    const shape = () => notch().querySelector("[data-material]") as HTMLElement;
    const { rerender } = render(<Notch opacity={0} />);
    tick(0);
    expect(shape().style.getPropertyValue("--notch-opacity")).toBe("0");

    rerender(<Notch opacity={100} />);
    expect(shape().style.getPropertyValue("--notch-opacity")).toBe("1");
    rerender(<Notch opacity={60} />);
    expect(shape().style.getPropertyValue("--notch-opacity")).toBe("0.6");

    // Rust already keeps this to 0-100; the notch does not have to trust it to draw something sane.
    rerender(<Notch opacity={400} />);
    expect(shape().style.getPropertyValue("--notch-opacity")).toBe("1");
    rerender(<Notch opacity={-20} />);
    expect(shape().style.getPropertyValue("--notch-opacity")).toBe("0");
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
    expect(lastLayout()[0].width).toBe(780 + 28);
  });

  describe("hidden widgets (ShellApi.setHidden)", () => {
    const backgroundRuns = vi.fn();
    const widget = (id: string, tab: "core" | "claude", extra: Partial<WidgetDefinition> = {}): WidgetDefinition => ({
      id,
      tab,
      title: id,
      description: "",
      Card: () => <p>{`card ${id}`}</p>,
      Pill: () => <span>{`pill ${id}`}</span>,
      MidPill: () => <span>{`mid ${id}`}</span>,
      ...extra,
    });
    const media = widget("media", "core", {
      Background: () => {
        backgroundRuns();
        return null;
      },
    });
    const clipboard = widget("clipboard", "core");
    const claude = widget("claude-sessions", "claude");

    let shell: Shell;
    const renderWith = (mode: "hover" | "click" | "always", widgets = [media, clipboard, claude]) =>
      render(
        <ShellProvider shell={shell}>
          <Notch widgets={widgets} mode={mode} priorityWidget="media" />
        </ShellProvider>,
      );
    beforeEach(() => {
      shell = createShell();
      backgroundRuns.mockClear();
    });

    it("the pill falls back to the next widget and comes back when shown again", () => {
      renderWith("click");
      expect(screen.getByText("pill media")).toBeInTheDocument();
      act(() => shell.api.setHidden("media", true));
      expect(screen.queryByText("pill media")).not.toBeInTheDocument();
      expect(screen.getByText("pill clipboard")).toBeInTheDocument();
      act(() => shell.api.setHidden("media", false));
      expect(screen.getByText("pill media")).toBeInTheDocument();
    });

    it("widens the pill to carry a Claude session and music at once", () => {
      renderWith("click", [media, claude]);
      expect(screen.getByTestId("pill-media")).toBeInTheDocument();
      expect(screen.getByTestId("pill-claude-sessions")).toBeInTheDocument();
      expect(screen.getByTestId("pill-divider")).toBeInTheDocument();
      expect(notch()).toHaveStyle({ width: "580px", height: "36px" });
    });

    it("narrows back to one pill when the music stops", () => {
      renderWith("click", [media, claude]);
      // What the media widget itself does when nothing is playing.
      act(() => shell.api.setHidden("media", true));
      expect(screen.queryByTestId("pill-media")).not.toBeInTheDocument();
      expect(screen.queryByTestId("pill-divider")).not.toBeInTheDocument();
      expect(screen.getByTestId("pill-claude-sessions")).toBeInTheDocument();
      expect(notch()).toHaveStyle({ width: "340px", height: "36px" });
    });

    it("always mode keeps only the other half, without a divider", () => {
      renderWith("always", [media, clipboard]);
      expect(screen.getByTestId("mid-divider")).toBeInTheDocument();
      act(() => shell.api.setHidden("media", true));
      expect(screen.queryByTestId("mid-media")).not.toBeInTheDocument();
      expect(screen.getByTestId("mid-clipboard")).toBeInTheDocument();
      expect(screen.queryByTestId("mid-divider")).not.toBeInTheDocument();
    });

    it("the panel drops the hidden card while its Background keeps running", () => {
      renderWith("click");
      act(() => shell.api.setHidden("media", true));
      fireEvent.click(screen.getByRole("button", { name: "Mở notch" }));
      expect(notch()).toHaveAttribute("data-state", "expanded");
      expect(screen.queryByText("card media")).not.toBeInTheDocument();
      expect(screen.getByText("card clipboard")).toBeInTheDocument();
      expect(backgroundRuns).toHaveBeenCalled();
    });

    it("drops a hidden widget's card out of the panel", () => {
      renderWith("click");
      fireEvent.click(screen.getByRole("button", { name: "Mở notch" }));
      expect(screen.getByText("card claude-sessions")).toBeInTheDocument();
      act(() => shell.api.setHidden("claude-sessions", true));
      expect(screen.queryByText("card claude-sessions")).not.toBeInTheDocument();
    });
  });

  describe("sticky", () => {
    beforeEach(() => requestSticky.mockClear());

    it("reserves nothing when off", () => {
      render(<Notch />);
      expect(requestSticky).toHaveBeenLastCalledWith(null);
    });

    it("reserves the collapsed notch and keeps it while the panel is open", () => {
      render(<Notch mode="click" sticky />);
      expect(requestSticky).toHaveBeenLastCalledWith(36);
      fireEvent.click(screen.getByRole("button"));
      expect(notch()).toHaveAttribute("data-state", "expanded");
      expect(requestSticky).toHaveBeenCalledTimes(1);
    });

    it("follows the always size and the floating gap", () => {
      const { rerender } = render(<Notch mode="always" sticky />);
      expect(requestSticky).toHaveBeenLastCalledWith(64);
      rerender(<Notch mode="hover" sticky layout="float" topGap={8} />);
      expect(requestSticky).toHaveBeenLastCalledWith(44);
      rerender(<Notch mode="hover" layout="float" topGap={8} />);
      expect(requestSticky).toHaveBeenLastCalledWith(null);
    });
  });

  describe("dragging along the top edge", () => {
    beforeEach(() => {
      vi.spyOn(window.screen, "width", "get").mockReturnValue(1536);
    });
    afterEach(() => vi.restoreAllMocks());

    const press = (x: number) =>
      fireEvent.pointerDown(notch().children[1].firstElementChild as Element, { pointerId: 1, button: 0, screenX: x });
    const move = (x: number) => fireEvent.pointerMove(notch(), { pointerId: 1, screenX: x });
    const release = (x: number) => fireEvent.pointerUp(notch(), { pointerId: 1, screenX: x });

    it("starts at the saved offset", () => {
      render(<Notch offsetX={-200} />);
      tick(0);
      expect(lastCall()[2]).toBe(-200);
    });

    it("moves the window with the pointer, saves on release and does not open", () => {
      const onOffsetChange = vi.fn();
      render(<Notch mode="click" onOffsetChange={onOffsetChange} />);
      tick(0);
      press(700);
      move(704);
      tick(0);
      expect(lastCall()[2]).toBe(0);
      move(600);
      tick(0);
      expect(lastCall()[2]).toBe(-100);
      expect(notch()).toHaveAttribute("data-dragging");
      move(-2000);
      tick(0);
      expect(lastCall()[2]).toBe(-584);
      release(-2000);
      fireEvent.click(notch().children[1].firstElementChild as Element);
      expect(onOffsetChange).toHaveBeenCalledWith(-584);
      expect(notch()).toHaveAttribute("data-state", "pill");
      tick(0);
      expect(lastCall()[2]).toBe(-584);
    });

    it("a press that moves less than 6px is still a click", () => {
      const onOffsetChange = vi.fn();
      render(<Notch mode="click" onOffsetChange={onOffsetChange} />);
      press(700);
      move(705);
      release(705);
      fireEvent.click(notch().children[1].firstElementChild as Element);
      expect(notch()).toHaveAttribute("data-state", "expanded");
      expect(onOffsetChange).not.toHaveBeenCalled();
    });

    it("hover mode: pressing cancels the hover timer so a slow drag does not open the panel", () => {
      render(<Notch />);
      fireEvent.mouseEnter(notch());
      tick(100);
      press(700);
      tick(400);
      expect(notch()).toHaveAttribute("data-state", "pill");
    });

    it("keeps the dropped spot until the saved setting comes back", () => {
      const { rerender } = render(<Notch mode="click" offsetX={0} onOffsetChange={() => {}} />);
      press(700);
      move(800);
      release(800);
      tick(0);
      expect(lastCall()[2]).toBe(100);
      rerender(<Notch mode="click" offsetX={100} onOffsetChange={() => {}} />);
      rerender(<Notch mode="click" offsetX={0} onOffsetChange={() => {}} />);
      tick(0);
      expect(lastCall()[2]).toBe(0);
    });
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
    expect(lastLayout()).toEqual([{ width: 368, height: 36 }, 0]);
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
    expect(screen.getByRole("button", { name: "Thu gọn" })).toBeInTheDocument();
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
    expect(notch()).toHaveStyle({ width: "620px", height: "64px" });
    expect(body()).toHaveStyle({ borderRadius: "0 0 32px 32px" });
  });

  it("opens the panel when the tray asks for it, in any mode", () => {
    render(<Notch mode="click" />);
    expect(trayOpenHandlers).toHaveLength(1);
    act(() => trayOpenHandlers[0]());
    expect(notch()).toHaveAttribute("data-state", "expanded");
  });

  it("opens the panel when the command bar or tray asks for it", () => {
    render(<Notch mode="hover" widgets={demoWidgets} />);
    act(() => trayOpenHandlers[0]("claude"));
    expect(notch()).toHaveAttribute("data-state", "expanded");
    // Everything is on screen at once now, so the tab the caller asked for no longer picks anything.
    expect(screen.getByText("Cooking")).toBeInTheDocument();
    expect(screen.getByText("Card thường")).toBeInTheDocument();
  });

  it("uses the requested pill size and gap", () => {
    render(<Notch pillSize={PILL_SIZES.l} topGap={40} layout="float" />);
    tick(0);
    expect(lastLayout()).toEqual([{ width: 400, height: 40 }, 40]);
  });

  it("ignores the gap when attached", () => {
    render(<Notch pillSize={PILL_SIZES.l} topGap={40} />);
    tick(0);
    expect(lastLayout()).toEqual([{ width: 428, height: 40 }, 0]);
  });

  it("shows the first widget that provides pill content", () => {
    render(<Notch widgets={demoWidgets} />);
    expect(screen.getByText("Demo widget")).toBeInTheDocument();
  });

  describe("alerts and flash on the pill", () => {
    let shell: Shell;
    const answers: string[] = [];
    const Approval = () => (
      <>
        <span>wait for you</span>
        <button type="button" onClick={() => answers.push("allow")}>
          Cho phép
        </button>
      </>
    );
    const approval: PillAlert = { id: "approval", source: "demo-claude", priority: 5, Content: Approval };
    const Copied = () => <span>Đã copy</span>;
    const renderWithShell = (mode: "hover" | "click" = "hover") =>
      render(
        <ShellProvider shell={shell}>
          <Notch widgets={demoWidgets} mode={mode} />
        </ShellProvider>,
      );

    beforeEach(() => {
      shell = createShell();
      answers.length = 0;
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("widens the pill to the alert size and shows the alert", () => {
      renderWithShell();
      act(() => shell.api.alerts.push(approval));
      expect(notch()).toHaveAttribute("data-state", "alert");
      expect(notch()).toHaveStyle({ width: "490px", height: "40px" });
      expect(body()).toHaveStyle({ borderRadius: "0 0 20px 20px" });
      expect(screen.getByText("wait for you")).toBeInTheDocument();
      tick(0);
      expect(lastLayout()).toEqual([{ width: 518, height: 40 }, 0]);
    });

    it("does not open on hover while an alert is shown", () => {
      renderWithShell();
      act(() => shell.api.alerts.push(approval));
      fireEvent.mouseEnter(notch());
      tick(1000);
      expect(notch()).toHaveAttribute("data-state", "alert");
    });

    it("runs the alert's own button without opening the panel", () => {
      renderWithShell();
      act(() => shell.api.alerts.push(approval));
      fireEvent.click(screen.getByRole("button", { name: "Cho phép" }));
      expect(answers).toEqual(["allow"]);
      expect(notch()).toHaveAttribute("data-state", "alert");
    });

    it("opens the panel when the alert text is clicked", () => {
      renderWithShell();
      act(() => shell.api.alerts.push(approval));
      fireEvent.click(screen.getByText("wait for you"));
      expect(notch()).toHaveAttribute("data-state", "expanded");
      // The alert's own widget is on screen without anyone having to pick a tab.
      expect(screen.getByText("Cooking")).toBeInTheDocument();
    });

    it("returns to the normal pill when the alert is dismissed", () => {
      renderWithShell();
      act(() => shell.api.alerts.push(approval));
      act(() => shell.api.alerts.dismiss("approval"));
      expect(notch()).toHaveAttribute("data-state", "pill");
      expect(screen.getByText("Demo widget")).toBeInTheDocument();
    });

    it("drops a widget's alerts when that widget is disabled", () => {
      const { rerender } = renderWithShell();
      act(() => shell.api.alerts.push(approval));
      expect(notch()).toHaveAttribute("data-state", "alert");
      rerender(
        <ShellProvider shell={shell}>
          <Notch widgets={demoWidgets.filter((w) => w.id !== "demo-claude")} />
        </ShellProvider>,
      );
      expect(shell.getSnapshot().alert).toBeUndefined();
      expect(notch()).toHaveAttribute("data-state", "pill");
    });

    it("flashes pill content for 1.2s, then shows the widget pill again", () => {
      renderWithShell();
      act(() => shell.api.flashPill(Copied));
      expect(screen.getByText("Đã copy")).toBeInTheDocument();
      tick(FLASH_MS);
      expect(screen.queryByText("Đã copy")).not.toBeInTheDocument();
      expect(screen.getByText("Demo widget")).toBeInTheDocument();
    });

    it("lets widgets open the panel and collapse it", () => {
      renderWithShell("click");
      act(() => shell.api.openPanel("claude"));
      expect(notch()).toHaveAttribute("data-state", "expanded");
      expect(screen.getByText("Cooking")).toBeInTheDocument();
      act(() => shell.api.collapse());
      expect(notch()).toHaveAttribute("data-state", "pill");
    });
  });

  describe("always mode", () => {
    let shell: Shell;
    beforeEach(() => {
      shell = createShell();
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    const renderAlways = (widgets = demoWidgets, priorityWidget?: string) =>
      render(
        <ShellProvider shell={shell}>
          <Notch widgets={widgets} mode="always" priorityWidget={priorityWidget} />
        </ShellProvider>,
      );

    it("shows two widgets side by side, priority first, with a divider", () => {
      renderAlways(demoWidgets, "demo-claude");
      const blocks = screen.getAllByTestId(/^mid-demo/);
      expect(blocks.map((b) => b.dataset.testid)).toEqual(["mid-demo-claude", "mid-demo-card"]);
      expect(screen.getAllByTestId("mid-divider")).toHaveLength(1);
      expect(notch()).toHaveStyle({ width: "620px", height: "64px" });
    });

    it("lets a single widget fill the large pill", () => {
      renderAlways(demoWidgets.filter((w) => w.id !== "demo-claude"));
      expect(screen.getAllByTestId(/^mid-demo/).map((b) => b.dataset.testid)).toEqual(["mid-demo-card"]);
      expect(screen.queryByTestId("mid-divider")).not.toBeInTheDocument();
    });

    it("shows an alert inside the large pill and keeps its size", () => {
      renderAlways();
      act(() =>
        shell.api.alerts.push({
          id: "a",
          source: "demo-claude",
          priority: 5,
          Content: () => (
            <>
              <span>wait for you</span>
              <button type="button">Cho phép</button>
            </>
          ),
        }),
      );
      expect(notch()).toHaveAttribute("data-state", "always");
      expect(notch()).toHaveStyle({ width: "620px", height: "64px" });
      expect(screen.queryAllByTestId(/^mid-demo/)).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Cho phép" }));
      expect(notch()).toHaveAttribute("data-state", "always");
      fireEvent.click(screen.getByText("wait for you"));
      expect(notch()).toHaveAttribute("data-state", "expanded");
      expect(screen.getByText("Cooking")).toBeInTheDocument();
    });

    it("opens on click and collapses back to the large pill", () => {
      renderAlways();
      fireEvent.click(screen.getByTestId("mid-demo-card"));
      expect(notch()).toHaveAttribute("data-state", "expanded");
      fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));
      expect(notch()).toHaveAttribute("data-state", "always");
      expect(notch()).toHaveStyle({ width: "620px", height: "64px" });
    });
  });
});
