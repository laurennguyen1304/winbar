import { describe, expect, it } from "vitest";
import { calculatorOnly, instantAnswer } from "./instant";

describe("instantAnswer", () => {
  it("answers calculations and conversions with display and copy forms", () => {
    expect(instantAnswer("2^10")).toEqual({ expression: "2^10", display: "= 1,024", copy: "1024" });
    expect(instantAnswer("5 km to mi")).toEqual({ expression: "5 km to mi", display: "3.10686 mi", copy: "3.10686" });
    expect(instantAnswer("30 c to f")).toEqual({ expression: "30 c to f", display: "86 °F", copy: "86" });
  });

  it("stays out of ordinary searches", () => {
    expect(instantAnswer("code")).toBeNull();
    expect(instantAnswer("12")).toBeNull();
  });

  it("treats a leading = as calculator only", () => {
    expect(calculatorOnly(" = 2+")).toBe(true);
    expect(calculatorOnly("2+2")).toBe(false);
  });
});
