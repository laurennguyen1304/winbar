import { describe, expect, it } from "vitest";
import { neighbourSession, seekByKey, seekFromPointer } from "./controls";

describe("seekFromPointer", () => {
  it("maps the pointer on the bar to a position, clamped to the track", () => {
    expect(seekFromPointer(150, 100, 200, 240_000)).toBe(60_000);
    expect(seekFromPointer(100, 100, 200, 240_000)).toBe(0);
    expect(seekFromPointer(40, 100, 200, 240_000)).toBe(0);
    expect(seekFromPointer(900, 100, 200, 240_000)).toBe(240_000);
    expect(seekFromPointer(150, 100, 0, 240_000)).toBe(0);
  });
});

describe("seekByKey", () => {
  it("moves 5 s with the arrows and jumps with Home/End", () => {
    expect(seekByKey("ArrowRight", 60_000, 240_000)).toBe(65_000);
    expect(seekByKey("ArrowLeft", 60_000, 240_000)).toBe(55_000);
    expect(seekByKey("ArrowLeft", 2_000, 240_000)).toBe(0);
    expect(seekByKey("ArrowRight", 238_000, 240_000)).toBe(240_000);
    expect(seekByKey("Home", 60_000, 240_000)).toBe(0);
    expect(seekByKey("End", 60_000, 240_000)).toBe(240_000);
    expect(seekByKey("Enter", 60_000, 240_000)).toBeNull();
  });
});

describe("neighbourSession", () => {
  const sessions = [
    { id: "Spotify", appName: "Spotify" },
    { id: "chrome.exe", appName: "Google Chrome" },
    { id: "vlc.exe", appName: "Vlc" },
  ];

  it("steps through apps and wraps around", () => {
    expect(neighbourSession(sessions, "Spotify", 1)).toBe("chrome.exe");
    expect(neighbourSession(sessions, "vlc.exe", 1)).toBe("Spotify");
    expect(neighbourSession(sessions, "Spotify", -1)).toBe("vlc.exe");
  });

  it("has nothing to switch to with one app", () => {
    expect(neighbourSession(sessions.slice(0, 1), "Spotify", 1)).toBeUndefined();
    expect(neighbourSession([], "Spotify", 1)).toBeUndefined();
  });
});
