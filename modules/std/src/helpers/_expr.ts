import { ErrorException, Num, isHexString, isNum } from "@evmcrispr/sdk";

// ---------------------------------------------------------------------------
//  Operator definitions
// ---------------------------------------------------------------------------

const ARITH_BINARY = new Set(["+", "-", "*", "/", "//", "%", "^"]);
const BOOL_COMPARISON = new Set(["==", "!=", "<", "<=", ">", ">="]);
const BOOL_LOGICAL = new Set(["and", "or"]);
const BOOL_PREFIX = new Set(["not"]);

const ALL_ARITH = new Set([...ARITH_BINARY]);
const ALL_BOOL = new Set([...BOOL_COMPARISON, ...BOOL_LOGICAL, ...BOOL_PREFIX]);

interface OpInfo {
  prec: number;
  assoc: "left" | "right";
  arity: "binary" | "prefix";
}

const ARITH_OPS: Record<string, OpInfo> = {
  "+": { prec: 1, assoc: "left", arity: "binary" },
  "-": { prec: 1, assoc: "left", arity: "binary" },
  "*": { prec: 2, assoc: "left", arity: "binary" },
  "/": { prec: 2, assoc: "left", arity: "binary" },
  "//": { prec: 2, assoc: "left", arity: "binary" },
  "%": { prec: 2, assoc: "left", arity: "binary" },
  "^": { prec: 3, assoc: "right", arity: "binary" },
};

const BOOL_OPS: Record<string, OpInfo> = {
  or: { prec: 1, assoc: "left", arity: "binary" },
  and: { prec: 2, assoc: "left", arity: "binary" },
  not: { prec: 3, assoc: "right", arity: "prefix" },
  "==": { prec: 4, assoc: "left", arity: "binary" },
  "!=": { prec: 4, assoc: "left", arity: "binary" },
  "<": { prec: 4, assoc: "left", arity: "binary" },
  "<=": { prec: 4, assoc: "left", arity: "binary" },
  ">": { prec: 4, assoc: "left", arity: "binary" },
  ">=": { prec: 4, assoc: "left", arity: "binary" },
};

// ---------------------------------------------------------------------------
//  No-space validation (mini-lexer)
// ---------------------------------------------------------------------------

const OPERATOR_CHARS = /[+\-*/%^<>=!]/;

function detectMissingSpaces(token: string, validOps: Set<string>): void {
  if (validOps.has(token) || token === "(" || token === ")") return;

  for (let i = 0; i < token.length; i++) {
    if (OPERATOR_CHARS.test(token[i])) {
      let op = token[i];
      if (i + 1 < token.length && OPERATOR_CHARS.test(token[i + 1])) {
        op += token[i + 1];
      }
      if (!validOps.has(op)) continue;
      const hasBefore = i > 0 && !OPERATOR_CHARS.test(token[i - 1]);
      const hasAfter = i + op.length < token.length && !OPERATOR_CHARS.test(token[i + op.length]);
      if (hasBefore && hasAfter) {
        const spaced = token.slice(0, i) + ` ${op} ` + token.slice(i + op.length);
        throw new ErrorException(
          `Missing spaces around operator '${op}': did you mean '${spaced.trim()}'?`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
//  Value coercion
// ---------------------------------------------------------------------------

export function toNum(v: unknown): Num {
  if (v === true || v === "true") return Num(1n);
  if (v === false || v === "false") return Num(0n);
  if (v instanceof Num) return v;
  if (typeof v === "string" && isHexString(v)) return Num(BigInt(v));
  if (isNum(v)) return Num(v);
  if (typeof v === "string") return Num(v);
  throw new ErrorException("Cannot convert value to number");
}

export function isTruthy(value: unknown): boolean {
  if (value === "false" || value === "") return false;
  if (value instanceof Num) return !value.eq(Num(0n));
  if (isNum(value)) return !Num(value).eq(Num(0n));
  return Boolean(value);
}

// ---------------------------------------------------------------------------
//  Shunting-yard core
// ---------------------------------------------------------------------------

function applyBinary(op: string, left: unknown, right: unknown, ops: Record<string, OpInfo>): unknown {
  if (ops === ARITH_OPS) return applyArith(op, left, right);
  return applyBool(op, left, right);
}

function applyArith(op: string, rawL: unknown, rawR: unknown): Num {
  const l = toNum(rawL);
  const r = toNum(rawR);
  switch (op) {
    case "+": return l.add(r);
    case "-": return l.sub(r);
    case "*": return l.mul(r);
    case "/": return l.div(r);
    case "//": {
      if (!l.isInteger() || !r.isInteger())
        throw new ErrorException("Integer division requires integer operands");
      return Num.fromBigInt(l.toBigInt() / r.toBigInt());
    }
    case "%": {
      if (!l.isInteger() || !r.isInteger())
        throw new ErrorException("Modulo requires integer operands");
      return Num.fromBigInt(l.toBigInt() % r.toBigInt());
    }
    case "^": return l.pow(r);
    default: throw new ErrorException(`Unknown arithmetic operator '${op}'`);
  }
}

function applyBool(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case "and": return isTruthy(left) && isTruthy(right);
    case "or": return isTruthy(left) || isTruthy(right);
    case "==":
      if (isNum(left) && isNum(right)) return Num(left).eq(Num(right));
      return left === right;
    case "!=":
      if (isNum(left) && isNum(right)) return !Num(left).eq(Num(right));
      return left !== right;
    case ">":
    case ">=":
    case "<":
    case "<=": {
      if (!isNum(left) || !isNum(right))
        throw new ErrorException(`Operator '${op}' requires numeric operands`);
      const a = Num(left);
      const b = Num(right);
      if (op === ">") return a.gt(b);
      if (op === ">=") return a.gte(b);
      if (op === "<") return a.lt(b);
      return a.lte(b);
    }
    default: throw new ErrorException(`Unknown boolean operator '${op}'`);
  }
}

const UNARY_MINUS = "unary-";

function applyPrefix(op: string, operand: unknown): unknown {
  if (op === "not") return !isTruthy(operand);
  if (op === UNARY_MINUS) return toNum(operand).mul(Num(-1n));
  throw new ErrorException(`Unknown prefix operator '${op}'`);
}

const PREFIX_OPS: Record<string, { prec: number }> = {
  [UNARY_MINUS]: { prec: 10 },
  not: { prec: 3 },
};

function isStackPrefix(op: string): boolean {
  return op in PREFIX_OPS;
}

function shouldPop(
  stackOp: string,
  currentOp: string,
  ops: Record<string, OpInfo>,
): boolean {
  if (isStackPrefix(stackOp)) {
    const c = ops[currentOp];
    if (!c) return false;
    return PREFIX_OPS[stackOp].prec >= c.prec;
  }
  const s = ops[stackOp];
  const c = ops[currentOp];
  if (!s || !c) return false;
  if (c.assoc === "left") return s.prec >= c.prec;
  return s.prec > c.prec;
}

function popAndApply(opStack: string[], output: unknown[], ops: Record<string, OpInfo>): void {
  const op = opStack.pop()!;
  if (isStackPrefix(op)) {
    if (output.length < 1) throw new ErrorException(`Missing operand for '${op}'`);
    output.push(applyPrefix(op, output.pop()));
  } else {
    if (output.length < 2) throw new ErrorException(`Missing operand for '${op}'`);
    const r = output.pop();
    const l = output.pop();
    output.push(applyBinary(op, l, r, ops));
  }
}

function evaluate(tokens: unknown[], ops: Record<string, OpInfo>, validOps: Set<string>, label: string): unknown {
  const output: unknown[] = [];
  const opStack: string[] = [];

  let prevWasValue = false;

  for (const token of tokens) {
    if (typeof token === "string" && token === "(") {
      opStack.push("(");
      prevWasValue = false;
      continue;
    }

    if (typeof token === "string" && token === ")") {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== "(") {
        popAndApply(opStack, output, ops);
      }
      if (opStack.length === 0) throw new ErrorException("Mismatched parentheses");
      opStack.pop();
      prevWasValue = true;
      continue;
    }

    const isOp = typeof token === "string" && (validOps.has(token) || token === "-");
    const isUnaryMinus = token === "-" && !prevWasValue && ops === ARITH_OPS;
    const isPrefix = typeof token === "string" && ops[token]?.arity === "prefix";

    if (isOp && (isPrefix || isUnaryMinus) && !prevWasValue) {
      const prefixOp = isUnaryMinus ? UNARY_MINUS : (token as string);
      opStack.push(prefixOp);
      prevWasValue = false;
      continue;
    }

    if (isOp && prevWasValue) {
      const opStr = token as string;
      if (!ops[opStr]) {
        throw new ErrorException(
          `Operator '${opStr}' is not valid in ${label}. ` +
          (label === "@bool" ? "Use @num(...) for arithmetic." : ""),
        );
      }
      while (opStack.length > 0 && opStack[opStack.length - 1] !== "(" && shouldPop(opStack[opStack.length - 1], opStr, ops)) {
        popAndApply(opStack, output, ops);
      }
      opStack.push(opStr);
      prevWasValue = false;
      continue;
    }

    if (typeof token === "string" && !validOps.has(token) && token !== "(" && token !== ")") {
      detectMissingSpaces(token, validOps);
    }

    output.push(token);
    prevWasValue = true;
  }

  while (opStack.length > 0) {
    if (opStack[opStack.length - 1] === "(") throw new ErrorException("Mismatched parentheses");
    popAndApply(opStack, output, ops);
  }

  if (output.length !== 1) {
    throw new ErrorException(`Invalid ${label} expression`);
  }

  return output[0];
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export function validateNoEmbeddedOps(token: unknown, context: "arithmetic" | "boolean"): void {
  if (typeof token !== "string") return;
  const ops = context === "arithmetic" ? ALL_ARITH : ALL_BOOL;
  detectMissingSpaces(token, ops);
}

export function evaluateArithmeticExpr(tokens: unknown[]): Num {
  if (tokens.length === 0) throw new ErrorException("@num requires at least one argument");

  for (const t of tokens) {
    if (typeof t === "string" && ALL_BOOL.has(t)) {
      throw new ErrorException(
        `Operator '${t}' is not valid in @num. Use @bool(...) for comparisons and logic.`,
      );
    }
  }

  const result = evaluate(tokens, ARITH_OPS, ALL_ARITH, "@num");
  return toNum(result);
}

export function evaluateBoolExpr(tokens: unknown[]): boolean {
  if (tokens.length === 0) throw new ErrorException("@bool requires at least one argument");

  for (const t of tokens) {
    if (typeof t === "string" && ALL_ARITH.has(t) && !ALL_BOOL.has(t)) {
      throw new ErrorException(
        `Operator '${t}' is not valid in @bool. Use @num(...) for arithmetic.`,
      );
    }
  }

  const result = evaluate(tokens, BOOL_OPS, ALL_BOOL, "@bool");
  return isTruthy(result);
}
