// Unit conversion for the command bar (SPEC-command-bar §5.4): "<number> <unit> to|in|sang|-> <unit>".

interface Unit {
  group: string;
  /** Multiply by this to reach the group's base unit (temperatures use `toBase`/`fromBase`). */
  factor?: number;
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
  /** Shown after the number. */
  label: string;
}

const linear = (group: string, factor: number, label: string): Unit => ({ group, factor, label });
const KIB = 1024;

// Speed in metres per second is "m/s" (or "mps"): "ms" is milliseconds.
const UNITS: Record<string, Unit> = {
  mm: linear("length", 0.001, "mm"),
  cm: linear("length", 0.01, "cm"),
  m: linear("length", 1, "m"),
  km: linear("length", 1000, "km"),
  in: linear("length", 0.0254, "in"),
  ft: linear("length", 0.3048, "ft"),
  yd: linear("length", 0.9144, "yd"),
  mi: linear("length", 1609.344, "mi"),

  mg: linear("mass", 0.001, "mg"),
  g: linear("mass", 1, "g"),
  kg: linear("mass", 1000, "kg"),
  t: linear("mass", 1e6, "t"),
  oz: linear("mass", 28.349523125, "oz"),
  lb: linear("mass", 453.59237, "lb"),

  c: { group: "temperature", toBase: (v) => v, fromBase: (v) => v, label: "°C" },
  f: { group: "temperature", toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32, label: "°F" },
  k: { group: "temperature", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15, label: "K" },

  ml: linear("volume", 0.001, "ml"),
  l: linear("volume", 1, "l"),
  gal: linear("volume", 3.785411784, "gal"),
  floz: linear("volume", 0.0295735295625, "floz"),

  kmh: linear("speed", 1 / 3.6, "kmh"),
  mph: linear("speed", 0.44704, "mph"),
  "m/s": linear("speed", 1, "m/s"),

  b: linear("data", 1, "b"),
  kb: linear("data", KIB, "kb"),
  mb: linear("data", KIB ** 2, "mb"),
  gb: linear("data", KIB ** 3, "gb"),
  tb: linear("data", KIB ** 4, "tb"),

  ms: linear("time", 0.001, "ms"),
  s: linear("time", 1, "s"),
  min: linear("time", 60, "min"),
  h: linear("time", 3600, "h"),
  d: linear("time", 86400, "d"),
};

const ALIASES: Record<string, string> = {
  "°c": "c",
  "°f": "f",
  "km/h": "kmh",
  kph: "kmh",
  mps: "m/s",
  byte: "b",
  bytes: "b",
};

const PATTERN = /^(-?\d+(?:\.\d+)?|-?\.\d+)\s*([a-z°/]+)\s+(?:to|in|sang|->)\s+([a-z°/]+)$/;

const lookup = (name: string) => UNITS[ALIASES[name] ?? name] as Unit | undefined;

export interface Conversion {
  expression: string;
  value: number;
  unit: string;
}

/** The converted value, rounded to 6 significant digits, or null when the text is not a valid conversion. */
export function convert(text: string): Conversion | null {
  const expression = text.trim();
  const m = PATTERN.exec(expression.toLowerCase());
  if (!m) return null;
  const from = lookup(m[2]);
  const to = lookup(m[3]);
  if (!from || !to || from.group !== to.group) return null;
  const input = Number(m[1]);
  const base = from.toBase ? from.toBase(input) : input * (from.factor as number);
  const raw = to.fromBase ? to.fromBase(base) : base / (to.factor as number);
  if (!Number.isFinite(raw)) return null;
  const value = Number(raw.toPrecision(6));
  return { expression, value: value === 0 ? 0 : value, unit: to.label };
}
