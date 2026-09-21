import { describe, expect, it } from "vitest";
import { convert } from "./units";

describe("convert", () => {
  it.each([
    ["5 km to mi", 3.10686, "mi"],
    ["5km to mi", 3.10686, "mi"],
    ["12 in to cm", 30.48, "cm"],
    ["1 mi in ft", 5280, "ft"],
    ["2.5 kg sang lb", 5.51156, "lb"],
    ["16 oz -> g", 453.592, "g"],
    ["30 c to f", 86, "°F"],
    ["-40 f to c", -40, "°C"],
    ["0 c to k", 273.15, "K"],
    ["1 gal to l", 3.78541, "l"],
    ["500 ml to floz", 16.907, "floz"],
    ["100 kmh to mph", 62.1371, "mph"],
    ["10 m/s to kmh", 36, "kmh"],
    ["2 gb sang mb", 2048, "mb"],
    ["1 tb to gb", 1024, "gb"],
    ["90 min to h", 1.5, "h"],
    ["1500 ms to s", 1.5, "s"],
    ["2 d to h", 48, "h"],
  ])("%s", (text, value, unit) => {
    const result = convert(text);
    expect(result?.unit).toBe(unit);
    expect(result?.value).toBeCloseTo(value, 6);
  });

  it("is case-insensitive and keeps the typed expression", () => {
    expect(convert(" 5 KM To MI ")).toMatchObject({ expression: "5 KM To MI", value: 3.10686, unit: "mi" });
  });

  it("rounds to 6 significant digits", () => {
    expect(convert("1 lb to kg")?.value).toBe(0.453592);
    expect(convert("123456789 mm to km")?.value).toBe(123.457);
  });

  it.each(["5 km to kg", "5 parsec to km", "km to mi", "5 km", "5 km to", "code", "5 c to mb", "1e3 m to km", "5 km to mi please"])(
    "rejects %j",
    (text) => {
      expect(convert(text)).toBeNull();
    },
  );
});
