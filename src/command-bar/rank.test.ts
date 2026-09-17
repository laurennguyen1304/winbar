import { describe, expect, it } from "vitest";
import { fold, initials, rankNames, scoreName, Tier } from "./rank";

describe("fold", () => {
  it("lower-cases and removes Vietnamese diacritics, including đ", () => {
    expect(fold("Cài đặt")).toBe("cai dat");
    expect(fold("ĐIỆN THOẠI")).toBe("dien thoai");
    expect(fold("Visual Studio Code")).toBe("visual studio code");
  });
});

describe("initials", () => {
  it("takes the first letter of each word, camelCase part and dotted part", () => {
    expect(initials("Visual Studio Code")).toBe("vsc");
    expect(initials("WindowsTerminal")).toBe("wt");
    expect(initials("paint.net")).toBe("pn");
    expect(initials("Microsoft Edge - Beta")).toBe("meb");
  });
});

describe("scoreName", () => {
  it.each([
    ["terminal", "Terminal", Tier.Exact],
    ["vsc", "Visual Studio Code", Tier.Initials],
    ["vs", "Visual Studio Code", Tier.Initials],
    ["code", "Code Insiders", Tier.Prefix],
    ["code", "Visual Studio Code", Tier.WordPrefix],
    ["term", "Windows Terminal", Tier.WordPrefix],
    ["hrom", "Google Chrome", Tier.Substring],
    ["gchr", "Google Chrome", Tier.Subsequence],
    ["cai dat", "Cài đặt", Tier.Exact],
    ["dat", "Cài đặt", Tier.WordPrefix],
  ])("%s → %s", (query, name, tier) => {
    expect(scoreName(query, name)?.tier).toBe(tier);
  });

  it("does not match unrelated names", () => {
    expect(scoreName("xyz", "Visual Studio Code")).toBeNull();
    expect(scoreName("  ", "Terminal")).toBeNull();
  });
});

describe("rankNames", () => {
  const apps = [
    "Visual Studio Code",
    "Code Insiders",
    "Windows Terminal",
    "Terminal",
    "Settings",
    "WSL Settings",
    "Google Chrome",
    "Codex",
    "Calculator",
    "Snipping Tool",
  ].map((name) => ({ name }));

  const top = (query: string, n = 3) => rankNames(query, apps, (a) => a.name).slice(0, n).map((r) => r.item.name);

  it("puts the expected app in the first three for the spec examples", () => {
    expect(top("code")).toContain("Visual Studio Code");
    expect(top("term")).toContain("Terminal");
    expect(top("vsc")[0]).toBe("Visual Studio Code");
    expect(top("sett")[0]).toBe("Settings");
  });

  it("orders by tier, then shorter names, then the original order", () => {
    expect(top("code", 3)).toEqual(["Codex", "Code Insiders", "Visual Studio Code"]);
    expect(top("terminal", 2)).toEqual(["Terminal", "Windows Terminal"]);
  });

  it("uses letters-in-order matches only when nothing matches better", () => {
    const names = ["Visual Studio Code", "Microsoft Edge", "Google Chrome"].map((name) => ({ name }));
    expect(rankNames("code", names, (a) => a.name).map((r) => r.item.name)).toEqual(["Visual Studio Code"]);
    expect(rankNames("gchr", names, (a) => a.name).map((r) => r.item.name)).toEqual(["Google Chrome"]);
  });

  it("gives every result a score that sorts the same way", () => {
    const ranked = rankNames("se", apps, (a) => a.name);
    const scores = ranked.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
