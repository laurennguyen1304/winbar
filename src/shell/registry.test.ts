import { describe, expect, it } from "vitest";
import { createRegistry } from "./registry";
import type { WidgetDefinition } from "./widget-contract";

const Card = () => null;
const def = (id: string, tab: "core" | "claude" = "core"): WidgetDefinition => ({ id, tab, title: id, description: "", Card });

describe("widget registry", () => {
  it("keeps registration order and filters by tab", () => {
    const r = createRegistry();
    r.register(def("media"));
    r.register(def("claude-usage", "claude"));
    r.register(def("clipboard"));
    expect(r.all().map((x) => x.id)).toEqual(["media", "claude-usage", "clipboard"]);
    expect(r.byTab("core").map((x) => x.id)).toEqual(["media", "clipboard"]);
    expect(r.byTab("claude").map((x) => x.id)).toEqual(["claude-usage"]);
  });

  it("rejects duplicate and malformed ids", () => {
    const r = createRegistry();
    r.register(def("media"));
    expect(() => r.register(def("media"))).toThrow(/already registered/);
    expect(() => r.register(def("Media Player"))).toThrow(/kebab-case/);
  });
});
