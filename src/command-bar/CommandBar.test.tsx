import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../shell/settings";
import type { SearchResult, WidgetDefinition } from "../shell/widget-contract";
import { CommandBar } from "./CommandBar";

const { shellNative } = vi.hoisted(() => ({
  shellNative: { changed: [] as Array<(s: Settings) => void> },
}));

vi.mock("../shell/native", () => ({
  loadSettings: () => Promise.resolve(undefined),
  saveSettings: (s: Settings) => Promise.resolve(s),
  onSettingsChanged: (h: (s: Settings) => void) => {
    shellNative.changed.push(h);
    return () => shellNative.changed.splice(shellNative.changed.indexOf(h), 1);
  },
}));

const { historyNative } = vi.hoisted(() => ({
  historyNative: { list: vi.fn(() => Promise.resolve([] as unknown[])) },
}));

const { native } = vi.hoisted(() => ({
  native: {
    hide: vi.fn(() => Promise.resolve()),
    resize: vi.fn(() => Promise.resolve()),
    drag: vi.fn(() => Promise.resolve()),
    save: vi.fn(() => Promise.resolve({ maxHeight: 300 })),
    opened: [] as Array<(o: { maxHeight: number }) => void>,
    moved: [] as Array<() => void>,
  },
}));

vi.mock("./native", () => ({
  hideCommandBar: native.hide,
  resizeCommandBar: native.resize,
  onCommandBarOpened: (h: (o: { maxHeight: number }) => void) => {
    native.opened.push(h);
    return () => native.opened.splice(native.opened.indexOf(h), 1);
  },
  startDragging: native.drag,
  searchFiles: (_q: string, generation: number) => Promise.resolve({ generation, source: "off", hits: [], error: null }),
  openPath: () => Promise.resolve(),
  openUrl: () => Promise.resolve(),
  listApps: () => Promise.resolve([]),
  recordRun: () => Promise.resolve(),
  historyList: () => historyNative.list(),
  openNotch: () => Promise.resolve(),
  notchHidden: () => Promise.resolve(false),
  setNotchHidden: () => Promise.resolve(),
  openWinbarSettings: () => Promise.resolve(),
  quitWinbar: () => Promise.resolve(),
  shellIcons: (specs: string[]) => Promise.resolve(specs.map(() => null)),
  launchApp: () => Promise.resolve(),
  revealApp: () => Promise.resolve(),
  revealPath: () => Promise.resolve(),
  saveCommandBarPosition: native.save,
  onMoved: (h: () => void) => {
    native.moved.push(h);
    return () => native.moved.splice(native.moved.indexOf(h), 1);
  },
}));

const input = () => screen.getByRole("textbox", { name: "Tìm kiếm" });
const bar = () => screen.getByTestId("command-bar");
const openBar = (maxHeight = 800) => act(() => native.opened.forEach((h) => h({ maxHeight })));
const move = () => act(() => native.moved.forEach((h) => h()));
// Long enough for the files provider to get past its typing pause (it finds nothing outside Tauri).
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(150)));
const type = async (value: string) => {
  fireEvent.change(input(), { target: { value } });
  await flush();
};
const key = (k: string, extra: object = {}) => fireEvent.keyDown(input(), { key: k, ...extra });
const selectedTitle = () => screen.getByRole("option", { selected: true }).querySelector(":scope > div > span")?.textContent;

const ran: string[] = [];
const item = (id: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  id,
  title: id,
  subtitle: `sub ${id}`,
  verb: "Chạy",
  run: () => void ran.push(id),
  ...extra,
});
const searchWidget = (id: string, items: SearchResult[], prefix?: string): WidgetDefinition => ({
  id,
  tab: "core",
  title: id,
  description: "",
  Card: () => null,
  searchProvider: {
    id,
    title: id.toUpperCase(),
    prefix,
    search: (q) => Promise.resolve(items.filter((i) => i.title.includes(q))),
  },
});
const windowFocus = (focused: boolean) => act(() => void window.dispatchEvent(new Event(focused ? "focus" : "blur")));

describe("CommandBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    native.hide.mockClear();
    native.drag.mockClear();
    native.save.mockClear();
    native.opened.length = 0;
    native.moved.length = 0;
    shellNative.changed.length = 0;
    historyNative.list.mockImplementation(() => Promise.resolve([]));
  });
  afterEach(() => vi.useRealTimers());

  it("shows widget blocks under an empty input, and hides them once you type", () => {
    const withBlock: WidgetDefinition = {
      id: "clipboard",
      tab: "core",
      title: "Clipboard",
      description: "",
      Card: () => null,
      CommandBarBlock: () => <p>clipboard block</p>,
    };
    render(<CommandBar registered={[withBlock]} />);
    expect(screen.getByText("clipboard block")).toBeInTheDocument();
    // Typing hands the space to the results, which carry clipboard items through its provider anyway.
    fireEvent.change(screen.getByRole("textbox", { name: "Tìm kiếm" }), { target: { value: "abc" } });
    expect(screen.queryByText("clipboard block")).not.toBeInTheDocument();
  });

  it("shows no block for a widget without one", () => {
    render(<CommandBar registered={[]} />);
    expect(screen.queryByTestId("command-bar-blocks")).not.toBeInTheDocument();
  });

  it("focuses the input and selects the previous text when opened", () => {
    render(<CommandBar registered={[]} />);
    fireEvent.change(input(), { target: { value: "code" } });
    input().blur();
    openBar();
    expect(bar()).toHaveAttribute("data-open", "true");
    expect(input()).toHaveFocus();
    expect((input() as HTMLInputElement).selectionStart).toBe(0);
    expect((input() as HTMLInputElement).selectionEnd).toBe(4);
  });

  it("clears the text on the first Esc and hides after the fade on the second", () => {
    render(<CommandBar registered={[]} />);
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
    render(<CommandBar registered={[]} />);
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
    render(<CommandBar registered={[]} />);
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
    render(<CommandBar registered={[]} />);
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
    render(<CommandBar registered={[]} />);
    openBar();
    fireEvent.keyDown(input(), { key: "Escape" });
    act(() => vi.advanceTimersByTime(50));
    openBar();
    act(() => vi.advanceTimersByTime(500));
    expect(native.hide).not.toHaveBeenCalled();
    expect(bar()).toHaveAttribute("data-open", "true");
  });

  it("drags from the grip and saves the position once the window stops moving", async () => {
    render(<CommandBar registered={[]} />);
    openBar();
    fireEvent.pointerDown(screen.getByTestId("grip"), { button: 0 });
    expect(native.drag).toHaveBeenCalledTimes(1);
    move();
    act(() => vi.advanceTimersByTime(100));
    move();
    act(() => vi.advanceTimersByTime(100));
    expect(native.save).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(300));
    expect(native.save).toHaveBeenCalledTimes(1);
    expect(bar().style.maxHeight).toBe("300px");

    // Later moves without pressing the grip (Rust placing the window on open) are not saved.
    move();
    act(() => vi.advanceTimersByTime(1000));
    expect(native.save).toHaveBeenCalledTimes(1);
  });

  it("does not save when the grip is pressed without moving, or with another mouse button", () => {
    render(<CommandBar registered={[]} />);
    openBar();
    fireEvent.pointerDown(screen.getByTestId("grip"), { button: 2 });
    expect(native.drag).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId("grip"), { button: 0 });
    act(() => vi.advanceTimersByTime(2000));
    move();
    act(() => vi.advanceTimersByTime(1000));
    expect(native.save).not.toHaveBeenCalled();
  });

  it("caps its height to the room left on the screen", () => {
    render(<CommandBar registered={[]} />);
    openBar(240);
    expect(bar().style.maxHeight).toBe("240px");
  });

  it("shows provider results in groups, first row selected with its verb", async () => {
    const widgets = [searchWidget("apps", [item("alpha"), item("beta")]), searchWidget("acts", [item("alpine")])];
    render(<CommandBar registered={widgets} />);
    openBar();
    await type("al");
    const groups = screen.getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["APPS", "ACTS"]);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(selectedTitle()).toBe("alpha");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Chạy");
    expect(screen.getByText("sub alpha")).toBeInTheDocument();
    expect(screen.queryByText(/Không tìm thấy kết quả/)).not.toBeInTheDocument();
  });

  it("moves the selection with the arrows without wrapping, and Enter runs the selected row", async () => {
    ran.length = 0;
    render(<CommandBar registered={[searchWidget("apps", [item("a1"), item("a2"), item("a3")])]} />);
    openBar();
    await type("a");
    key("ArrowUp");
    expect(selectedTitle()).toBe("a1");
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowDown");
    expect(selectedTitle()).toBe("a3");
    key("Enter");
    await flush();
    expect(ran).toEqual(["a3"]);
    expect(bar()).toHaveAttribute("data-open", "true");

    key("Enter", { isComposing: true });
    await flush();
    expect(ran).toEqual(["a3"]);
  });

  it("Ctrl+Enter runs the secondary action only when there is one", async () => {
    ran.length = 0;
    const withAlt = item("file", { runAlt: () => void ran.push("file (folder)") });
    render(<CommandBar registered={[searchWidget("files", [withAlt, item("plain")])]} />);
    openBar();
    await type("");
    await type("l");
    key("Enter", { ctrlKey: true });
    key("ArrowDown");
    key("Enter", { ctrlKey: true });
    await flush();
    expect(ran).toEqual(["file (folder)"]);
  });

  it("selects on mouse move and runs on click", async () => {
    ran.length = 0;
    render(<CommandBar registered={[searchWidget("apps", [item("a1"), item("a2")])]} />);
    openBar();
    await type("a");
    const second = screen.getAllByRole("option")[1];
    fireEvent.mouseMove(second);
    expect(selectedTitle()).toBe("a2");
    fireEvent.click(screen.getAllByRole("option")[0]);
    await flush();
    expect(ran).toEqual(["a1"]);
  });

  it("goes back to the first row when the text changes", async () => {
    render(<CommandBar registered={[searchWidget("apps", [item("a1"), item("a2")])]} />);
    openBar();
    await type("a");
    key("ArrowDown");
    expect(selectedTitle()).toBe("a2");
    await type("a2");
    await type("a");
    expect(selectedTitle()).toBe("a1");
  });

  it("searches one widget through its prefix, and drops its group when the widget is turned off", async () => {
    const widgets = [searchWidget("apps", [item("demo app")]), searchWidget("demo", [item("demo one"), item("two")], "demo")];
    render(<CommandBar registered={widgets} />);
    openBar();
    await type("demo");
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["DEMO"]);
    expect(screen.getAllByRole("option")).toHaveLength(2);

    act(() =>
      shellNative.changed.forEach((h) =>
        h({ ...DEFAULT_SETTINGS, widgets: [{ id: "apps", enabled: true }, { id: "demo", enabled: false }] }),
      ),
    );
    await flush();
    await flush();
    expect(screen.queryByRole("group", { name: "DEMO" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["APPS"]);
  });

  it("shows a calculation as a selected block and copies the plain number on Enter", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CommandBar registered={[]} />);
    openBar();
    await type("1000*2^10");
    const block = screen.getByRole("option", { name: /= 1,024,000/ });
    expect(block).toHaveAttribute("aria-selected", "true");
    expect(block).toHaveTextContent("1000*2^10");
    key("Enter");
    await flush();
    expect(writeText).toHaveBeenCalledWith("1024000");
    expect(screen.getByRole("status")).toHaveTextContent("Đã copy 1024000");
    expect(bar()).toHaveAttribute("data-open", "true");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows conversions, keeps other groups below the answer, and arrows reach them", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    ran.length = 0;
    render(<CommandBar registered={[searchWidget("notes", [item("5 km to mi notes")])]} />);
    openBar();
    await type("5 km to mi");
    expect(screen.getByRole("option", { name: /3\.10686 mi/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("group", { name: "NOTES" })).toBeInTheDocument();
    key("ArrowDown");
    expect(selectedTitle()).toBe("5 km to mi notes");
    key("ArrowUp");
    fireEvent.click(screen.getByRole("option", { name: /3\.10686 mi/ }));
    await flush();
    expect(writeText).toHaveBeenCalledWith("3.10686");
    expect(ran).toEqual([]);
  });

  it("does not add the web fallback under a calculation", async () => {
    render(<CommandBar registered={[]} />);
    openBar();
    await type("12*7+3");
    expect(screen.getByRole("option", { name: /= 87/ })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Web" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("with = asks no other provider and shows the empty state for an invalid expression", async () => {
    const search = vi.fn(() => Promise.resolve([item("x")]));
    const widget: WidgetDefinition = { ...searchWidget("apps", []), searchProvider: { id: "apps", title: "APPS", search } };
    render(<CommandBar registered={[widget]} />);
    openBar();
    await type("= 2+");
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByText(/Không tìm thấy kết quả/)).toBeInTheDocument();
    await type("=7");
    expect(screen.getByRole("option", { name: /= 7/ })).toBeInTheDocument();
  });

  it("offers a web search under the no-results note, lists the four sites after ?, and /y searches YouTube only", async () => {
    render(<CommandBar registered={[]} />);
    openBar();
    await type("tauri tray");
    expect(screen.getByText(/Không tìm thấy kết quả/)).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining('Tìm "tauri tray" trên Google')]);
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");

    await type("? tauri tray");
    expect(screen.queryByText(/Không tìm thấy kết quả/)).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Web" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);

    await type("/y lofi");
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["YouTube"]);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining('Tìm "lofi" trên YouTube')]);
  });

  it("shows Gần đây when the input is empty, and hides it while typing", async () => {
    historyNative.list.mockImplementation(() =>
      Promise.resolve([
        [{ kind: "action", target: "open-notch", title: "Mở notch", subtitle: "winbar", count: 3, lastUsed: 0 }, 3],
        [{ kind: "file", target: "C:/a.pdf", title: "a.pdf", subtitle: "Downloads", count: 1, lastUsed: 0 }, 1],
      ]),
    );
    render(<CommandBar registered={[]} />);
    openBar();
    await flush();
    expect(screen.getByRole("group", { name: "Gần đây" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.querySelector(":scope > div > span")?.textContent)).toEqual([
      "Mở notch",
      "a.pdf",
    ]);
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    await type("zz");
    expect(screen.queryByRole("group", { name: "Gần đây" })).not.toBeInTheDocument();
  });

  it("clears with the Xóa button and keeps typing focus", async () => {
    render(<CommandBar registered={[]} />);
    openBar();
    expect(screen.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "abc" } });
    await flush();
    expect(screen.getByText(/Không tìm thấy kết quả/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
    expect(screen.queryByText(/Không tìm thấy kết quả/)).not.toBeInTheDocument();
  });
});
