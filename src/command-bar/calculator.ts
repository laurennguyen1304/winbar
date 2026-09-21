// Calculator for the command bar (SPEC-command-bar §5.4). A small recursive-descent parser: no code is ever
// evaluated, only numbers, + - * / % ^, parentheses, a few functions and the constants pi and e.

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  round: Math.round,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const MAX_LENGTH = 200;

type Token =
  | { kind: "number"; value: number }
  | { kind: "constant"; value: number }
  | { kind: "function"; fn: (x: number) => number }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "%" | "^" }
  | { kind: "open" }
  | { kind: "close" };

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|([a-z]+)|([-+*/%^])|(\()|(\)))/gy;
  const input = text.toLowerCase();
  let at = 0;
  while (at < input.length) {
    if (/^\s+$/.test(input.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(input);
    if (!m) return null;
    at = re.lastIndex;
    const [, num, word, op, open, close] = m;
    if (num !== undefined) tokens.push({ kind: "number", value: Number(num) });
    else if (word !== undefined) {
      if (word in FUNCTIONS) tokens.push({ kind: "function", fn: FUNCTIONS[word] });
      else if (word in CONSTANTS) tokens.push({ kind: "constant", value: CONSTANTS[word] });
      else return null;
    } else if (op !== undefined) tokens.push({ kind: "op", op: op as "+" });
    else if (open !== undefined) tokens.push({ kind: "open" });
    else if (close !== undefined) tokens.push({ kind: "close" });
  }
  return tokens;
}

class Parser {
  private at = 0;
  /** Binary operations (including implied multiplication) and function calls: "did this compute anything?". */
  operations = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.expression();
    if (this.at !== this.tokens.length) throw new Error("unexpected token");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private isOp(...ops: string[]): boolean {
    const t = this.peek();
    return t?.kind === "op" && ops.includes(t.op);
  }

  private expression(): number {
    let value = this.term();
    while (this.isOp("+", "-")) {
      const op = (this.tokens[this.at++] as { op: string }).op;
      const right = this.term();
      value = op === "+" ? value + right : value - right;
      this.operations++;
    }
    return value;
  }

  private term(): number {
    let value = this.unary();
    for (;;) {
      if (this.isOp("*", "/", "%")) {
        const op = (this.tokens[this.at++] as { op: string }).op;
        const right = this.unary();
        value = op === "*" ? value * right : op === "/" ? value / right : value % right;
        this.operations++;
      } else if (this.impliesMultiplication()) {
        // "2pi", "2(3+1)", "sqrt(16)sqrt(9)"
        value *= this.power();
        this.operations++;
      } else {
        return value;
      }
    }
  }

  private impliesMultiplication(): boolean {
    const previous = this.tokens[this.at - 1];
    const next = this.peek();
    const endsOperand = previous?.kind === "number" || previous?.kind === "constant" || previous?.kind === "close";
    const startsFactor = next?.kind === "open" || next?.kind === "function" || next?.kind === "constant";
    return endsOperand && startsFactor;
  }

  private unary(): number {
    if (this.isOp("-")) {
      this.at++;
      return -this.unary();
    }
    if (this.isOp("+")) {
      this.at++;
      return this.unary();
    }
    return this.power();
  }

  /** Right-associative, binds tighter than unary minus: -2^2 = -4, 2^3^2 = 512. */
  private power(): number {
    const base = this.primary();
    if (!this.isOp("^")) return base;
    this.at++;
    this.operations++;
    return base ** this.unary();
  }

  private primary(): number {
    const t = this.tokens[this.at++];
    switch (t?.kind) {
      case "number":
      case "constant":
        return t.value;
      case "function": {
        if (this.peek()?.kind !== "open") throw new Error("function needs parentheses");
        this.operations++;
        return t.fn(this.parenthesised());
      }
      case "open":
        this.at--;
        return this.parenthesised();
      default:
        throw new Error("expected a number");
    }
  }

  private parenthesised(): number {
    this.at++; // "("
    const value = this.expression();
    if (this.tokens[this.at++]?.kind !== "close") throw new Error("missing )");
    return value;
  }
}

function run(text: string): { value: number; operations: number } | null {
  if (text.length > MAX_LENGTH) return null;
  const tokens = tokenize(text);
  if (!tokens || tokens.length === 0) return null;
  const parser = new Parser(tokens);
  let value: number;
  try {
    value = parser.parse();
  } catch {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  // Drop floating point noise (0.1 + 0.2) without touching large integers.
  if (Math.abs(value) < 1e15) value = Math.round(value * 1e10) / 1e10;
  return { value: value === 0 ? 0 : value, operations: parser.operations };
}

/** The value of `text`, or null when it is not a valid, finite expression. */
export function evaluate(text: string): number | null {
  return run(text)?.value ?? null;
}

export interface Calculation {
  expression: string;
  value: number;
}

/**
 * What the command bar shows for the typed text. With a leading "=" any valid expression counts; without it the
 * text must contain a digit and actually compute something, so "12" or "code" stay ordinary searches.
 */
export function calculate(text: string): Calculation | null {
  const trimmed = text.trim();
  const forced = trimmed.startsWith("=");
  const expression = forced ? trimmed.slice(1).trim() : trimmed;
  if (!forced && !/\d/.test(expression)) return null;
  const result = run(expression);
  if (!result || (!forced && result.operations === 0)) return null;
  return { expression, value: result.value };
}

/** Display form with thousands separators; copying uses `String(value)`. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 10 });
}
