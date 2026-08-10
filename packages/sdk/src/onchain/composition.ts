/**
 * The type-composition table: which operators accept which operand
 * categories, and what category the result carries. This is the single
 * source of truth — the assert compiler's combine functions consult it to
 * accept or reject an expression, and UIs import it (the website's builder
 * menus are built from it) to offer only the combinations that compile.
 *
 * The Operators contract itself is word-blind beyond its declared types:
 * `bitAnd(totalSupply, totalSupply)` would execute as a bitwise AND. These
 * rules are a compiler-level discipline that keeps expressions meaningful,
 * not a contract constraint.
 *
 * This module is pure data + pure functions with no dependencies, so it is
 * safe to import from any environment.
 */

/** Assertion value categories — canonical home is ./types (pure types);
 *  re-exported here so the composition table stays self-describing. */
export type { Category } from "./types";

import type { Category } from "./types";

/** Arithmetic operators the expression surface exposes; the signed int256
 *  overload is selected at encode time from the operand categories. */
export type ArithOpName =
  | "Add"
  | "Sub"
  | "Mul"
  | "Div"
  | "Mod"
  | "Exp"
  | "Min"
  | "Max"
  | "AbsDiff";

/** Comparison operators (Eq/Ne are sign-agnostic on raw words). */
export type CmpOpName = "Eq" | "Ne" | "Gt" | "Lt" | "Ge" | "Le";

/** Word-logic connectives (`@bool!`); `xor` doubles as bitwise on numbers. */
export type LogicOpName = "and" | "or" | "xor";

/** Operator families, matching how the ops lower to Operators functions
 *  through the core's `read`: arithmetic (incl. min/max/absDiff),
 *  comparison, boolean logic, and bitwise word ops (`@bytes!`). */
export type OpFamily = "arith" | "cmp" | "logic" | "bytes";

/** Arithmetic opcode → Operators function name. Every entry except `exp`
 *  has an int256 overload for signed operands. */
export const ARITH_FN: Record<ArithOpName, string> = {
  Add: "add",
  Sub: "sub",
  Mul: "mul",
  Div: "div",
  Mod: "mod",
  Exp: "exp",
  Min: "min",
  Max: "max",
  AbsDiff: "absDiff",
};

/** Comparison opcode → Operators function name (bool results, judged
 *  EQ 1). `eq`/`ne` are bit-level and unsigned-only; the ordering
 *  comparisons pick their int256 overload for signed operands. */
export const CMP_FN: Record<CmpOpName, string> = {
  Eq: "eq",
  Ne: "ne",
  Gt: "gt",
  Lt: "lt",
  Ge: "ge",
  Le: "le",
};

/** Logic connective → Operators function name (0/1 bool words make the
 *  bitwise ops coincide with the logical ones). */
export const LOGIC_FN: Record<LogicOpName, string> = {
  and: "bitAnd",
  or: "bitOr",
  xor: "bitXor",
};

/** `@bytes!` operator symbol → Operators function name. */
export const BITWISE_FN: Record<string, string> = {
  "&": "bitAnd",
  "|": "bitOr",
  // `xor`, not `^`: in an arithmetic expression `^` already means
  // exponentiation, and @num spells the bitwise one `xor`. Using `^` for two
  // different operations depending on which helper wraps them is the kind of
  // thing that reads fine and compiles to the wrong op.
  xor: "bitXor",
  "<<": "shl",
  ">>": "shr",
};

/** Outcome of a composition check: the result category, or the reason the
 *  combination is rejected (the exact message the compiler throws). */
export type Check =
  | { ok: true; result: Category }
  | { ok: false; reason: string };

const ok = (result: Category): Check => ({ ok: true, result });
const no = (reason: string): Check => ({ ok: false, reason });

export function isNumericCat(cat: Category): boolean {
  return cat === "Uint" || cat === "Int";
}

/** Word-shaped categories: values that fit a single 32-byte word (the only
 *  shapes the word operators can operate on). */
export function isWordCat(cat: Category): boolean {
  return cat !== "String" && cat !== "Bytes";
}

/** EVML infix symbol → arithmetic opcode (`@num!` surface). */
export const ARITH_SYMBOL: Record<string, ArithOpName> = {
  "+": "Add",
  "-": "Sub",
  "*": "Mul",
  "/": "Div",
  "//": "Div",
  "%": "Mod",
  "^": "Exp",
};

/** EVML infix symbol → comparison opcode (`@bool!` surface). */
export const CMP_SYMBOL: Record<string, CmpOpName> = {
  "==": "Eq",
  "!=": "Ne",
  ">": "Gt",
  "<": "Lt",
  ">=": "Ge",
  "<=": "Le",
};

/** EVML `@bytes!` operator symbols (bitwise word ops). */
export const BITWISE_SYMBOLS = ["&", "|", "xor", "<<", ">>"] as const;

/** Why a category cannot be an arithmetic operand, or null when it can.
 *  Bools are accepted implicitly: they pass as their raw 0/1 words. */
export function arithRejects(cat: Category): string | null {
  if (isNumericCat(cat) || cat === "Bool") return null;
  return `arithmetic needs numeric operands, got a ${cat} value`;
}

/** Full arithmetic check (min/max/absDiff included via their op names). */
export function checkArith(op: ArithOpName, l: Category, r: Category): Check {
  for (const cat of [l, r]) {
    const reason = arithRejects(cat);
    if (reason) return no(reason);
  }
  const signed = l === "Int" || r === "Int";
  if (signed && op === "Exp") {
    return no(
      "exponentiation is not supported for int256 operands (exp has no int256 overload)",
    );
  }
  // AbsDiff is the |l-r| magnitude — always an unsigned total result.
  return ok(op === "AbsDiff" ? "Uint" : signed ? "Int" : "Uint");
}

/** Comparison check. Booleans and strings compare with == / != against
 *  their own kind only; address/bytes32 words are eq-only too; dynamic
 *  bytes can't be compared inside an expression (top-level == / != on a
 *  bytes return is judged by the core instead). */
export function checkCmp(op: CmpOpName, l: Category, r: Category): Check {
  const eqOnly = op === "Eq" || op === "Ne";
  if (l === "Bool" || r === "Bool") {
    if (!eqOnly) {
      return no("boolean operands only support == and != comparisons");
    }
    if (l !== "Bool" || r !== "Bool") {
      return no("cannot compare a boolean with a non-boolean value");
    }
    return ok("Bool");
  }
  if (l === "String" || r === "String") {
    if (l !== r) {
      return no("cannot compare a string with a non-string value");
    }
    if (!eqOnly) {
      return no("strings only support == and != comparisons");
    }
    return ok("Bool");
  }
  if (l === "Bytes" || r === "Bytes") {
    return no(
      "dynamic bytes values only compare at the top level of an assertion (== / !=)",
    );
  }
  if (
    (l === "Address" ||
      l === "Bytes32" ||
      r === "Address" ||
      r === "Bytes32") &&
    !eqOnly
  ) {
    return no(
      `${op === "Gt" || op === "Ge" ? ">" : "<"}-style comparisons need numeric operands`,
    );
  }
  return ok("Bool");
}

/** Logic check: `and`/`or` need booleans; `xor` doubles as bitwise when
 *  both operands are numeric (result is a number, not a bool). */
export function checkLogic(op: LogicOpName, l: Category, r: Category): Check {
  if (op === "xor" && isNumericCat(l) && isNumericCat(r)) return ok("Uint");
  for (const cat of [l, r]) {
    if (cat !== "Bool") {
      return no(
        `'${op}' needs boolean operands — compare values first (e.g. \`x > 0 ${op} y > 0\`)`,
      );
    }
  }
  return ok("Bool");
}

/** Bitwise word check (`@bytes!` binary ops): any word-shaped operands. */
export function checkBitwise(l: Category, r: Category): Check {
  for (const cat of [l, r]) {
    if (!isWordCat(cat)) {
      return no(
        `@bytes! needs 32-byte word operands (numbers, bool, address, bytes32), got a ${cat} value`,
      );
    }
  }
  return ok("Uint");
}

/** An infix operator as UIs surface it: the EVML symbol plus its family
 *  (which disambiguates `^` — Exp in arithmetic, Xor in @bytes!). */
export interface InfixOp {
  symbol: string;
  family: OpFamily;
}

/** Every infix operator of the expression surface, in display order. */
export const INFIX_OPS: readonly InfixOp[] = [
  { symbol: "+", family: "arith" },
  { symbol: "-", family: "arith" },
  { symbol: "*", family: "arith" },
  { symbol: "/", family: "arith" },
  { symbol: "//", family: "arith" },
  { symbol: "%", family: "arith" },
  { symbol: "^", family: "arith" },
  { symbol: "==", family: "cmp" },
  { symbol: "!=", family: "cmp" },
  { symbol: ">", family: "cmp" },
  { symbol: "<", family: "cmp" },
  { symbol: ">=", family: "cmp" },
  { symbol: "<=", family: "cmp" },
  { symbol: "and", family: "logic" },
  { symbol: "or", family: "logic" },
  { symbol: "xor", family: "logic" },
  { symbol: "&", family: "bytes" },
  { symbol: "|", family: "bytes" },
  // Shares the spelling with the logic-family xor above on purpose: the word
  // means the same thing, and `^` is exponentiation in an arith expression.
  { symbol: "xor", family: "bytes" },
  { symbol: "<<", family: "bytes" },
  { symbol: ">>", family: "bytes" },
];

/** Check one infix operator against two operand categories. */
export function checkInfix(op: InfixOp, l: Category, r: Category): Check {
  switch (op.family) {
    case "arith":
      return checkArith(ARITH_SYMBOL[op.symbol], l, r);
    case "cmp":
      return checkCmp(CMP_SYMBOL[op.symbol], l, r);
    case "logic":
      return checkLogic(op.symbol as LogicOpName, l, r);
    case "bytes":
      return checkBitwise(l, r);
  }
}

/** The infix operators valid for a pair of operand categories — what a UI
 *  should offer. `a number combines with + and >=, but not with and`. */
export function allowedInfixOps(l: Category, r: Category): InfixOp[] {
  return INFIX_OPS.filter((op) => checkInfix(op, l, r).ok);
}
