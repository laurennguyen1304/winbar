import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShell, type Shell } from "../../shell/shell";
import { ShellProvider } from "../../shell/shell-context";
import { MediaCard } from "./MediaCard";
import { mediaWidget } from "./index";
import type { MediaState, MediaTrack } from "./native";
import { receiveForTest, resetMediaStore } from "./store";

const { native } = vi.hoisted(() => ({
  native: { initial: undefined as MediaState | undefined, art: new Map<string, string | null>() },
}));
vi.mock("./native", () => ({
  EMPTY_MEDIA: { sessions: [], current: null },
  getMediaState: () => Promise.resolve(native.initial ?? { sessions: [], current: null }),
  getMediaArt: (key: string) => Promise.resolve(native.art.get(key) ?? null),
  onMediaChanged: () => () => {},
}));

const track = (over: Partial<MediaTrack> = {}): MediaTrack => ({
  sessionId: "Spotify",
  title: "Midnight City",
  artist: "M83",
  album: "Hurry Up, We're Dreaming",
  trackKey: "k1",
  status: "playing",
  positionMs: 102_000,
  durationMs: 243_000,
  positionAt: Date.now(),
  rate: 1,
  can: { playPause: true, next: true, previous: true, seek: true },
  ...over,
});
const playing = (over: Partial<MediaTrack> = {}): MediaState => ({
  sessions: [{ id: "Spotify", appName: "Spotify" }],
  current: track(over),
});

describe("MediaCard", () => {
  beforeEach(() => {
    resetMediaStore();
    native.initial = undefined;
    native.art.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("shows the track, the app, the progress and the controls", async () => {
    native.art.set("k1", "data:image/png;base64,AAAA");
    native.initial = playing();
    render(<MediaCard />);
    expect(await screen.findByText("Midnight City")).toBeInTheDocument();
    expect(screen.getByText("M83")).toBeInTheDocument();
    expect(screen.getByText("Hurry Up, We're Dreaming")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.getByText("1:42")).toBeInTheDocument();
    expect(screen.getByText("4:03")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Tiến độ" })).toHaveAttribute("aria-valuenow", "102");
    expect(screen.getByRole("button", { name: "Tạm dừng" })).toBeEnabled();
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2)); // artwork + blurred backdrop
  });

  it("advances the progress every second while playing", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    native.initial = playing();
    render(<MediaCard />);
    await act(async () => {});
    expect(screen.getByText("1:42")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(3000));
    expect(screen.getByText("1:45")).toBeInTheDocument();
  });

  it("shows play when paused and greys out controls the app does not allow", async () => {
    native.initial = playing({ status: "paused", can: { playPause: true, next: false, previous: false, seek: false } });
    render(<MediaCard />);
    expect(await screen.findByRole("button", { name: "Phát" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bài kế" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bài trước" })).toBeDisabled();
  });

  it("uses the gradient tile when the app gives no artwork", async () => {
    native.initial = playing();
    render(<MediaCard />);
    await screen.findByText("Midnight City");
    await waitFor(() => expect(screen.getByTestId("art-placeholder").querySelector("svg")).not.toBeNull());
    expect(document.querySelector("img")).toBeNull();
  });

  it("hides the progress bar for livestreams", async () => {
    native.initial = playing({ durationMs: null, positionMs: null });
    render(<MediaCard />);
    await screen.findByText("Midnight City");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("replays the fade when the track changes", async () => {
    native.initial = playing();
    render(<MediaCard />);
    const first = await screen.findByTestId("media-body");
    act(() => receiveForTest(playing({ title: "Wait", trackKey: "k2" })));
    expect(await screen.findByText("Wait")).toBeInTheDocument();
    expect(screen.getByTestId("media-body")).not.toBe(first);
  });
});

describe("media widget background", () => {
  let shell: Shell;
  const Background = mediaWidget.Background as NonNullable<typeof mediaWidget.Background>;

  beforeEach(() => {
    resetMediaStore();
    native.initial = undefined;
    shell = createShell();
  });

  it("hides the widget while nothing has a media session", async () => {
    render(
      <ShellProvider shell={shell}>
        <Background />
      </ShellProvider>,
    );
    await act(async () => {});
    expect(shell.getSnapshot().hidden.has("media")).toBe(true);
    act(() => receiveForTest(playing()));
    expect(shell.getSnapshot().hidden.has("media")).toBe(false);
    act(() => receiveForTest({ sessions: [], current: null }));
    expect(shell.getSnapshot().hidden.has("media")).toBe(true);
  });
});
