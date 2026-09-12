/**
 * Safe, generic expression evaluator for the payslip engine.
 *
 * Whitelist only:
 *  - identifiers: `[A-Za-z_][A-Za-z0-9_.]*` (field paths, e.g. `basic`, `payroll.gross`)
 *  - numbers, operators `+ - * / % ( )`
 *  - functions: MIN, MAX, ROUND, ABS, IF
 *
 * Anything else (arbitrary JS, shell, SQL, `=`-prefixed code) is rejected.
 * No `eval`, no `new Function`, no prototype access.
 */

export type FormulaContext = Record<string, number | string | undefined>;

const IDENT = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const NUMBER = /^\d+(\.\d+)?$/;

const FN_WHITELIST: Record<string, (args: number[]) => number> = {
  MIN: (args) => Math.min(...args.map(toFinite)),
  MAX: (args) => Math.max(...args.map(toFinite)),
  ROUND: (args) => {
    const v = toFinite(args[0] ?? 0);
    const digits = args.length > 1 ? Math.trunc(args[1]) : 0;
    const p = Math.pow(10, digits);
    return Math.round(v * p) / p;
  },
  ABS: (args) => Math.abs(toFinite(args[0] ?? 0)),
  IF: (args) => (toFinite(args[0]) !== 0 ? toFinite(args[1] ?? 0) : toFinite(args[2] ?? 0)),
};

function toFinite(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface Token {
  type: "num" | "ident" | "fn" | "op" | "lp" | "rp" | "comma";
  value: string;
}

/** Tokenize a formula. Throws on any disallowed character. */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j += 1;
      tokens.push({ type: "num", value: expr.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_.]/.test(expr[j])) j += 1;
      const word = expr.slice(i, j);
      tokens.push({ type: word.toUpperCase() in FN_WHITELIST ? "fn" : "ident", value: word });
      i = j;
    } else if (two === ">=" || two === "<=" || two === "==" || two === "!=") {
      tokens.push({ type: "op", value: two }); i += 2;
    } else if (ch === "(") { tokens.push({ type: "lp", value: "(" }); i += 1; }
    else if (ch === ")") { tokens.push({ type: "rp", value: ")" }); i += 1; }
    else if (ch === ",") { tokens.push({ type: "comma", value: "," }); i += 1; }
    else if ("+-*/%<>".includes(ch)) { tokens.push({ type: "op", value: ch }); i += 1; }
    else throw new Error(`Formula contains unsupported character "${ch}"`);
  }
  return tokens;
}

type Node =
  | { kind: "num"; value: number }
  | { kind: "field"; name: string }
  | { kind: "bin"; op: string; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token | undefined { return this.tokens[this.pos++]; }

  parse(): Node {
    const node = this.expr();
    if (this.peek()) throw new Error("Unexpected trailing tokens in formula");
    return node;
  }

  private expr(): Node {
    let left = this.compare();
    while (this.peek()?.type === "op" && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.next()!.value;
      const right = this.compare();
      left = { kind: "bin", op, left, right };
    }
    return left;
  }

  private compare(): Node {
    let left = this.term();
    while (this.peek()?.type === "op" && [">", "<", ">=", "<=", "==", "!="].includes(this.peek()!.value)) {
      const op = this.next()!.value;
      const right = this.term();
      left = { kind: "bin", op, left, right };
    }
    return left;
  }

  private term(): Node {
    let left = this.unary();
    while (this.peek()?.type === "op" && ["*", "/", "%"].includes(this.peek()!.value)) {
      const op = this.next()!.value;
      const right = this.unary();
      left = { kind: "bin", op, left, right };
    }
    return left;
  }

  private unary(): Node {
    const t = this.peek();
    if (t?.type === "op" && (t.value === "-" || t.value === "+")) {
      this.next();
      const operand = this.unary();
      if (t.value === "-") return { kind: "bin", op: "*", left: { kind: "num", value: -1 }, right: operand };
      return operand;
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.next();
    if (!t) throw new Error("Unexpected end of formula");
    if (t.type === "num") {
      if (!NUMBER.test(t.value)) throw new Error(`Invalid number "${t.value}"`);
      return { kind: "num", value: Number(t.value) };
    }
    if (t.type === "ident") {
      if (!IDENT.test(t.value)) throw new Error(`Invalid identifier "${t.value}"`);
      return { kind: "field", name: t.value.toLowerCase() };
    }
    if (t.type === "fn") {
      const name = t.value.toUpperCase();
      if (this.next()?.type !== "lp") throw new Error(`Expected "(" after function ${name}`);
      const args: Node[] = [];
      if (this.peek()?.type !== "rp") {
        args.push(this.expr());
        while (this.peek()?.type === "comma") {
          this.next();
          args.push(this.expr());
        }
      }
      if (this.next()?.type !== "rp") throw new Error(`Unclosed function ${name} call`);
      return { kind: "call", name, args };
    }
    if (t.type === "lp") {
      const node = this.expr();
      if (this.next()?.type !== "rp") throw new Error("Unclosed parenthesis");
      return node;
    }
    throw new Error(`Unexpected token "${t.value}"`);
  }
}

/** Resolve a field path against the context (dot-separated). Returns 0 if missing. */
function resolveField(path: string, ctx: FormulaContext): number {
  for (const key of [path.toLowerCase(), path]) {
    if (ctx[key] !== undefined) return toFinite(ctx[key]);
  }
  return 0;
}

function evalNode(node: Node, ctx: FormulaContext): number {
  switch (node.kind) {
    case "num": return node.value;
    case "field": return resolveField(node.name, ctx);
    case "bin": {
      const l = evalNode(node.left, ctx);
      const r = evalNode(node.right, ctx);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? 0 : l / r;
        case "%": return r === 0 ? 0 : l % r;
        case ">": return l > r ? 1 : 0;
        case "<": return l < r ? 1 : 0;
        case ">=": return l >= r ? 1 : 0;
        case "<=": return l <= r ? 1 : 0;
        case "==": return Math.abs(l - r) < 1e-9 ? 1 : 0;
        case "!=": return Math.abs(l - r) >= 1e-9 ? 1 : 0;
        default: throw new Error(`Unsupported operator "${node.op}"`);
      }
    }
    case "call": {
      const fn = FN_WHITELIST[node.name];
      if (!fn) throw new Error(`Unsupported function "${node.name}"`);
      return fn(node.args.map((a) => evalNode(a, ctx)));
    }
  }
}

/**
 * Evaluate a safe formula string against a numeric context.
 * `expr` may be `"5000"`, `"{{basic}} * 0.5"`, `"MIN(basic*0.5, 15000)"`, etc.
 * Braces (`{{ }}`) are stripped before parsing.
 */
export function evaluateFormula(expr: string, ctx: FormulaContext): number {
  const cleaned = (expr || "").replace(/[{}]/g, "").trim();
  if (!cleaned) return 0;
  if (NUMBER.test(cleaned)) return Number(cleaned);
  const ast = new Parser(tokenize(cleaned)).parse();
  const value = evalNode(ast, ctx);
  return Number.isFinite(value) ? value : 0;
}

/** Parse a formula to AST (throws on invalid/unsafe input). */
export function parseFormula(expr: string): ReturnType<Parser["parse"]> {
  const cleaned = (expr || "").replace(/[{}]/g, "").trim();
  if (!cleaned) throw new Error("Empty formula");
  return new Parser(tokenize(cleaned)).parse();
}

/** List field dependencies referenced by a formula (registered into ctx keys). */
export function formulaFieldDeps(expr: string): string[] {
  const cleaned = (expr || "").replace(/[{}]/g, "").trim();
  if (!cleaned) return [];
  const deps = new Set<string>();
  for (const t of tokenize(cleaned)) {
    if (t.type === "ident") deps.add(t.value.toLowerCase());
  }
  return [...deps];
}