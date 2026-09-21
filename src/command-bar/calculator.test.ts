import { describe, expect, it } from "vitest";
import { calculate, evaluate, formatNumber } from "./calculator";
import calculatorSource from "./calculator.ts?raw";

describe("evaluate", () => {
  it.each([
    ["12*7+3", 87],
    ["2+3*4", 14],
    ["(2+3)*4", 20],
    ["((1+2)*(3+4))/7", 3],
    ["2^10", 1024],
    ["2^3^2", 512],
    ["-2^2", -4],
    ["(-2)^2", 4],
    ["10 % 4", 2],
    ["7 / 2", 3.5],
    ["1.5 * 4", 6],
    [".5 + .25", 0.75],
    ["-3 + -2", -5],
    ["sqrt(144)", 12],
    ["abs(-3.5)", 3.5],
    ["round(2.6)", 3],
    ["log(1000)", 3],
    ["ln(e)", 1],
    ["sin(0) + cos(0)", 1],
    ["2pi", 2 * Math.PI],
    ["2(3+1)", 8],
    ["sqrt(16)sqrt(9)", 12],
    ["0.1 + 0.2", 0.3],
    ["1/3", 0.3333333333],
  ])("%s = %d", (expr, value) => {
    expect(evaluate(expr)).toBeCloseTo(value, 9);
  });

  it("rounds away floating point noise to 10 decimals", () => {
    expect(evaluate("0.1 + 0.2")).toBe(0.3);
    expect(evaluate("1/3")).toBe(0.3333333333);
  });

  it.each(["1/0", "0/0", "sqrt(-1)", "10^999", "", "2+", "(2+3", "2+3)", "foo(2)", "2 ** 3", "2,5+1", "alert(1)", "sqrt 4"])(
    "rejects %j",
    (expr) => {
      expect(evaluate(expr)).toBeNull();
    },
  );
});

describe("calculate (what the command bar shows)", () => {
  it("recognises expressions without a prefix only when they compute something", () => {
    expect(calculate("12*7+3")).toEqual({ expression: "12*7+3", value: 87 });
    expect(calculate(" sqrt(144) ")).toEqual({ expression: "sqrt(144)", value: 12 });
    expect(calculate("2^10")?.value).toBe(1024);
    for (const text of ["code", "2", "-5", "pi", "12", "vscode 2", "1.2.3", ""]) expect(calculate(text), text).toBeNull();
  });

  it("with the = prefix any valid expression counts", () => {
    expect(calculate("=5")).toEqual({ expression: "5", value: 5 });
    expect(calculate("= pi")?.value).toBeCloseTo(Math.PI, 9);
    expect(calculate("= 2+")).toBeNull();
  });

  it("ignores very long input", () => {
    expect(calculate("1+".repeat(200) + "1")).toBeNull();
  });
});

describe("formatNumber", () => {
  it("adds thousands separators for display only", () => {
    expect(formatNumber(1024)).toBe("1,024");
    expect(formatNumber(1234567.891)).toBe("1,234,567.891");
    expect(formatNumber(-0.5)).toBe("-0.5");
  });
});

describe("safety", () => {
  it("never evaluates code", () => {
    expect(calculatorSource).toContain("recursive-descent parser");
    expect(calculatorSource).not.toMatch(/\beval\s*\(|new\s+Function|\bFunction\s*\(/);
  });
});
