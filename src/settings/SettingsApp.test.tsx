import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoWidgets } from "../widgets/demo";
import { DEFAULT_SETTINGS, type Settings } from "../shell/settings";
import { SettingsApp } from "./SettingsApp";

const { native } = vi.hoisted(() => ({
  native: {
    stored: undefined as Settings | undefined,
    saved: [] as Settings[],
    previews: [] as unknown[],
    quit: 0,
  },
}));

vi.mock("../shell/native", () => ({
  loadSettings: () => Promise.resolve(native.stored),
  saveSettings: (s: Settings) => {
    native.saved.push(s);
    native.stored = s;
    return Promise.resolve(s);
  },
  onSettingsChanged: () => () => {},
  emitPillPreview: (preview: unknown) => {
    native.previews.push(preview);
    return Promise.resolve();
  },
  getHotkeyStatus: () => Promise.resolve(undefined),
  retryHotkey: () => Promise.resolve(undefined),
  onHotkeyStatus: () => () => {},
  quitApp: () => {
    native.quit += 1;
    return Promise.resolve();
  },
}));

const lastSaved = () => native.saved.at(-1) as Settings;

async function renderLoaded() {
  render(<SettingsApp registered={demoWidgets} />);
  await waitFor(() => expect(screen.getByTestId("widget-row-demo-card")).toBeInTheDocument());
}

describe("SettingsApp", () => {
  beforeEach(() => {
    native.stored = { ...DEFAULT_SETTINGS, widgets: demoWidgets.map((w) => ({ id: w.id, enabled: true })) };
    native.saved.length = 0;
    native.previews.length = 0;
    native.quit = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows both previews and every section", async () => {
    await renderLoaded();
    expect(screen.getByTestId("preview-pill")).toHaveStyle({ width: "340px", height: "36px" });
    expect(screen.getByTestId("preview-always")).toHaveStyle({ width: "620px", height: "64px" });
    for (const name of ["Pill", "Widget", "Cỡ chữ", "Phím tắt", "Command bar", "Chung"])
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
  });

  it("saves the command bar options with the rest of the settings", async () => {
    await renderLoaded();
    const group = screen.getByRole("radiogroup", { name: "Trang tìm web ưu tiên" });
    fireEvent.click(within(group).getByRole("radio", { name: "Reddit" }));
    await waitFor(() => expect(lastSaved().commandBar.webSearch).toBe("reddit"));
    expect(lastSaved().pill).toEqual(DEFAULT_SETTINGS.pill);
  });

  it("saves the pill size and updates the preview", async () => {
    await renderLoaded();
    const group = screen.getByRole("radiogroup", { name: "Kích thước pill" });
    fireEvent.click(within(group).getByRole("radio", { name: "Lớn" }));
    await waitFor(() => expect(lastSaved().pill.size).toBe("l"));
    await waitFor(() => expect(screen.getByTestId("preview-pill")).toHaveStyle({ width: "400px", height: "40px" }));
  });

  describe("custom pill width", () => {
    const realWidth = window.screen.width;
    beforeEach(() => Object.defineProperty(window.screen, "width", { value: 1920, configurable: true }));
    afterEach(() => Object.defineProperty(window.screen, "width", { value: realWidth, configurable: true }));

    it("starts from the width on screen, so picking it does not make the pill jump", async () => {
      await renderLoaded();
      expect(screen.queryByRole("slider", { name: "Độ rộng pill (% màn hình)" })).not.toBeInTheDocument();
      const group = screen.getByRole("radiogroup", { name: "Kích thước pill" });
      fireEvent.click(within(group).getByRole("radio", { name: "Tùy chỉnh" }));
      // 340 px on a 1920 px screen is 18%.
      await waitFor(() => expect(lastSaved().pill).toMatchObject({ size: "custom", sizePercent: 18 }));
      expect(screen.getByRole("slider", { name: "Độ rộng pill (% màn hình)" })).toBeInTheDocument();
      expect(screen.getByText("18% · 346px")).toBeInTheDocument();
    });

    it("sends the notch every step of a drag and saves where it ends", async () => {
      native.stored = { ...(native.stored as Settings), pill: { ...DEFAULT_SETTINGS.pill, size: "custom" } };
      await renderLoaded();
      const slider = screen.getByRole("slider", { name: "Độ rộng pill (% màn hình)" });
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(native.previews).toContainEqual(expect.objectContaining({ size: "custom", sizePercent: 19 }));
      await waitFor(() => expect(lastSaved().pill.sizePercent).toBe(19));
      await waitFor(() => expect(screen.getByTestId("preview-pill")).toHaveStyle({ width: "365px", height: "36px" }));
    });

    it("gives the always pill its own slider", async () => {
      await renderLoaded();
      const group = screen.getByRole("radiogroup", { name: "Kích thước pill always" });
      fireEvent.click(within(group).getByRole("radio", { name: "Tùy chỉnh" }));
      // 620 px on 1920 px is 32%.
      await waitFor(() => expect(lastSaved().pill).toMatchObject({ alwaysSize: "custom", alwaysSizePercent: 32 }));
      expect(screen.getByRole("slider", { name: "Độ rộng pill always (% màn hình)" })).toBeInTheDocument();
    });
  });

  it("saves the notch layout and material", async () => {
    await renderLoaded();
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Kiểu notch" })).getByRole("radio", { name: "Pill nổi" }),
    );
    await waitFor(() => expect(lastSaved().pill.layout).toBe("float"));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Nền notch" })).getByRole("radio", { name: "Đặc" }));
    await waitFor(() => expect(lastSaved().pill).toMatchObject({ layout: "float", material: "dense" }));
  });

  it("puts a dragged notch back in the middle", async () => {
    native.stored = { ...(native.stored as Settings), pill: { ...DEFAULT_SETTINGS.pill, offsetX: -300 } };
    await renderLoaded();
    expect(screen.getByText("-300px")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Về giữa" }));
    await waitFor(() => expect(lastSaved().pill.offsetX).toBe(0));
    expect(screen.getByRole("button", { name: "Về giữa" })).toBeDisabled();
  });

  it("turns sticky on, off by default", async () => {
    await renderLoaded();
    const toggle = screen.getByRole("switch", { name: "Sticky" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(lastSaved().pill.sticky).toBe(true));
  });

  it("saves the open mode and the priority widget", async () => {
    await renderLoaded();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Cách mở" })).getByRole("radio", { name: "always" }));
    await waitFor(() => expect(lastSaved().pill.openMode).toBe("always"));
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Pill ưu tiên hiện" })).getByRole("radio", { name: "Demo Claude" }),
    );
    await waitFor(() => expect(lastSaved().pill.priorityWidget).toBe("demo-claude"));
  });

  it("turns a widget off", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("switch", { name: "Bật Demo cảnh báo" }));
    await waitFor(() => expect(lastSaved().widgets.find((w) => w.id === "demo-alerts")?.enabled).toBe(false));
  });

  it("moves a widget within its tab and disables moves past the ends", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: "Đưa Demo card lên" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đưa Demo Claude xuống" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Đưa Demo card xuống" }));
    await waitFor(() =>
      expect(
        lastSaved()
          .widgets.map((w) => w.id)
          .slice(0, 2),
      ).toEqual(["demo-alerts", "demo-card"]),
    );
  });

  it("saves the font scale from the keyboard", async () => {
    await renderLoaded();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Cỡ chữ" }), { key: "ArrowRight" });
    await waitFor(() => expect(lastSaved().fontScale).toBe(105));
  });

  it("toggles start with Windows", async () => {
    await renderLoaded();
    const toggle = screen.getByRole("switch", { name: "Khởi động cùng Windows" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(lastSaved().launchAtStartup).toBe(false));
  });

  it("quits the app", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Thoát winbar" }));
    expect(native.quit).toBe(1);
  });
});
