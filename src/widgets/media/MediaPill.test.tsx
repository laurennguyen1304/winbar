import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notch } from "../../shell/Notch";
import { createShell, type Shell } from "../../shell/shell";
import { ShellProvider } from "../../shell/shell-context";
import type { WidgetDefinition } from "../../shell/widget-contract";
import { mediaWidget } from "./index";
import { MediaMidPill, MediaPill } from "./MediaPill";
import type { MediaState, MediaTrack } from "./native";
import { receiveForTest, resetMediaStore } from "./store";

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("./native", () => ({
  EMPTY_MEDIA: { sessions: [], current: null },
  getMediaState: () => new Promise(() => {}),
  getMediaArt: () => Promise.resolve(null),
  onMediaChanged: () => () => {},
  mediaControl: (action: string) => {
    calls.push(action);
    return Promise.resolve();
  },
  mediaSeek: () => Promise.resolve(),
  mediaSelect: () => Promise.resolve(),
}));

const track = (over: Partial<MediaTrack> = {}): MediaTrack => ({
  sessionId: "Spotify",
  title: "Midnight City",
  artist: "M83",
  album: "",
  trackKey: "k1",
  status: "playing",
  positionMs: 0,
  durationMs: 243_000,
  positionAt: Date.now(),
  rate: 1,
  can: { playPause: true, next: true, previous: true, seek: true },
  ...over,
});
const state = (over: Partial<MediaTrack> = {}): MediaState => ({
  sessions: [{ id: "Spotify", appName: "Spotify" }],
  current: track(over),
});

beforeEach(() => {
  resetMediaStore();
  calls.length = 0;
});

describe("MediaPill", () => {
  it("shows artwork, title, artist and the three controls", () => {
    render(<MediaPill />);
    act(() => receiveForTest(state()));
    expect(screen.getByText("Midnight City")).toBeInTheDocument();
    expect(screen.getByText("M83")).toBeInTheDocument();
    expect(screen.getByTestId("art-placeholder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bài trước" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạm dừng" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bài kế" })).toBeInTheDocument();
    // No visualiser any more (bạn chốt 2026-09-18).
    expect(screen.queryByTestId("media-eq")).not.toBeInTheDocument();
  });

  it("runs previous, play-pause and next from the pill", () => {
    render(<MediaPill />);
    act(() => receiveForTest(state({ status: "paused" })));
    fireEvent.click(screen.getByRole("button", { name: "Bài trước" }));
    fireEvent.click(screen.getByRole("button", { name: "Phát" }));
    fireEvent.click(screen.getByRole("button", { name: "Bài kế" }));
    expect(calls).toEqual(["previous", "playPause", "next"]);
  });

  it("greys out what the app does not allow", () => {
    render(<MediaPill />);
    act(() => receiveForTest(state({ can: { playPause: true, next: false, previous: false, seek: false } })));
    expect(screen.getByRole("button", { name: "Bài kế" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bài trước" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bài kế" }));
    expect(calls).toEqual([]);
  });
});

describe("MediaMidPill", () => {
  it("has the same three controls", () => {
    render(<MediaMidPill />);
    act(() => receiveForTest(state({ status: "paused" })));
    fireEvent.click(screen.getByRole("button", { name: "Phát" }));
    fireEvent.click(screen.getByRole("button", { name: "Bài kế" }));
    expect(calls).toEqual(["playPause", "next"]);
  });
});

describe("media on the notch (SPEC-media §5.6)", () => {
  let shell: Shell;
  const claude: WidgetDefinition = {
    id: "claude-sessions",
    tab: "claude",
    title: "Claude",
    description: "",
    Card: () => null,
    Pill: () => <span>claude pill</span>,
    MidPill: () => <span>claude half</span>,
  };
  const renderNotch = (mode: "click" | "always") =>
    render(
      <ShellProvider shell={shell}>
        <Notch widgets={[claude, mediaWidget]} mode={mode} priorityWidget="claude-sessions" />
      </ShellProvider>,
    );

  beforeEach(() => {
    shell = createShell();
  });

  it("takes the pill when the preferred widget is empty and something plays", () => {
    renderNotch("click");
    expect(screen.getByText("claude pill")).toBeInTheDocument();
    act(() => shell.api.setHidden("claude-sessions", true));
    // Nothing plays yet: the media widget hid itself, so the default pill shows.
    expect(screen.getByText("winbar")).toBeInTheDocument();
    act(() => receiveForTest(state()));
    expect(screen.getByText("Midnight City")).toBeInTheDocument();
    act(() => shell.api.setHidden("claude-sessions", false));
    expect(screen.getByText("claude pill")).toBeInTheDocument();
  });

  it("the play button on the always pill does not open the panel", () => {
    renderNotch("always");
    act(() => receiveForTest(state()));
    expect(screen.getByTestId("mid-media")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng" }));
    expect(calls).toEqual(["playPause"]);
    expect(screen.getByTestId("notch")).toHaveAttribute("data-state", "always");
  });
});
