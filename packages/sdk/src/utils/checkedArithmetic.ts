import { ErrorException } from "../errors";
import { modularPower } from "./modular";
import { Num } from "./Num";

export const UINT256_MAX = (1n << 256n) - 1n;
export const INT256_MAX = (1n << 255n) - 1n;
export const INT256_MIN = -(1n << 255n);
export type CheckedRounding = "trunc" | "floor" | "ceil";
export interface CheckedInteger {
  value: bigint;
  signed: boolean;
}
const signedNumbers = new WeakSet<object>();
export function markSignedInteger<T extends Num>(value: T): T {
  signedNumbers.add(value);
  return value;
}
export function isSignedInteger(value: unknown): boolean {
  return value instanceof Num && signedNumbers.has(value);
}
export function checkedRange(value: bigint, signed: boolean): bigint {
  if (
    value < (signed ? INT256_MIN : 0n) ||
    value > (signed ? INT256_MAX : UINT256_MAX)
  ) {
    throw new ErrorException(
      `Integer overflow: result does not fit ${signed ? "int256" : "uint256"}`,
    );
  }
  return value;
}
export function checkedInteger(value: unknown): CheckedInteger {
  if (
    !(value instanceof Num) &&
    typeof value !== "bigint" &&
    typeof value !== "number"
  ) {
    throw new ErrorException(
      "Checked arithmetic requires integer operands; use an explicit conversion helper",
    );
  }
  const n = value instanceof Num ? value : Num(value);
  if (!n.isInteger())
    throw new ErrorException("Checked arithmetic rejects fractional operands");
  const signed = n.num < 0n || isSignedInteger(n);
  return { value: checkedRange(n.num, signed), signed };
}
export function checkedNum(integer: CheckedInteger): Num {
  const n = Num(checkedRange(integer.value, integer.signed));
  return integer.signed ? markSignedInteger(n) : n;
}
export function roundExactInteger(value: Num, mode: CheckedRounding): Num {
  const n =
    mode === "floor"
      ? value.floorBigInt()
      : mode === "ceil"
        ? value.ceilBigInt()
        : value.toBigInt();
  return checkedNum({ value: n, signed: n < 0n });
}
export function checkedBinary(
  op: string,
  a: CheckedInteger,
  b: CheckedInteger,
): CheckedInteger {
  const signed = op === "^" ? a.signed : a.signed || b.signed;
  const x = checkedRange(a.value, signed);
  const y = checkedRange(b.value, op === "^" ? false : signed);
  let value: bigint;
  switch (op) {
    case "+":
      value = x + y;
      break;
    case "-":
      value = x - y;
      break;
    case "*":
      value = x * y;
      break;
    case "//":
    case "%":
      if (y === 0n) throw new ErrorException("Division by zero");
      value = op === "//" ? x / y : x % y;
      break;
    case "xor":
      value = signed ? BigInt.asIntN(256, x ^ y) : BigInt.asUintN(256, x ^ y);
      break;
    case "^": {
      let base = x,
        exponent = y;
      value = 1n;
      while (exponent > 0n) {
        if (exponent & 1n) value = checkedRange(value * base, signed);
        exponent >>= 1n;
        if (exponent) base = checkedRange(base * base, signed);
      }
      break;
    }
    default:
      throw new ErrorException(`Unsupported checked operator '${op}'`);
  }
  return { value: checkedRange(value, signed), signed };
}
/** Full-width add/multiply/power followed immediately by remainder. */
export function checkedMod(
  op: string,
  a: CheckedInteger,
  b: CheckedInteger,
  m: CheckedInteger,
): CheckedInteger {
  const signed = a.signed || m.signed || (op !== "^" && b.signed);
  checkedRange(a.value, signed);
  checkedRange(m.value, signed);
  checkedRange(b.value, op === "^" ? b.signed : signed);
  if (op === "^")
    return { value: modularPower(a.value, b.value, m.value), signed };
  if (!m.value) throw new ErrorException("Division by zero");
  return {
    value: (op === "+" ? a.value + b.value : a.value * b.value) % m.value,
    signed,
  };
}

export function checkedMulDiv(
  a: CheckedInteger,
  b: CheckedInteger,
  d: CheckedInteger,
  mode: CheckedRounding,
): CheckedInteger {
  const signed = a.signed || b.signed || d.signed;
  for (const x of [a, b, d]) checkedRange(x.value, signed);
  if (!d.value) throw new ErrorException("Division by zero");
  const product = a.value * b.value;
  let value = product / d.value;
  if (product % d.value !== 0n) {
    const negative = product < 0n !== d.value < 0n;
    if (mode === "floor" && negative) value--;
    if (mode === "ceil" && !negative) value++;
  }
  return { value: checkedRange(value, signed), signed };
}

export type ArithmeticTree<T> =
  | { value: T }
  | { op: string; left: ArithmeticTree<T>; right?: ArithmeticTree<T> };
export type ArithmeticToken<T> = { value: T } | { op: string };
const precedence: Record<string, number> = {
  xor: 0,
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "//": 2,
  "%": 2,
  "^": 3,
};
export function parseCheckedExpression<T>(
  tokens: ArithmeticToken<T>[],
): ArithmeticTree<T> {
  let i = 0;
  function parse(min = 0): ArithmeticTree<T> {
    const t = tokens[i++];
    if (!t) throw new ErrorException("Missing arithmetic operand");
    let left: ArithmeticTree<T>;
    if ("value" in t) left = t;
    else if (t.op === "-") left = { op: "neg", left: parse(10) };
    else if (t.op === "(") {
      left = parse();
      const close = tokens[i++];
      if (!close || !("op" in close) || close.op !== ")")
        throw new ErrorException("Mismatched parentheses");
    } else throw new ErrorException(`Unexpected arithmetic token '${t.op}'`);
    while (i < tokens.length) {
      const next = tokens[i];
      if (
        !("op" in next) ||
        !(next.op in precedence) ||
        precedence[next.op] < min
      )
        break;
      i++;
      left = {
        op: next.op,
        left,
        right: parse(precedence[next.op] + (next.op === "^" ? 0 : 1)),
      };
    }
    return left;
  }
  const result = parse();
  if (i !== tokens.length)
    throw new ErrorException("Invalid arithmetic expression");
  return result;
}
export function roundedExpressionParts<T>(
  tree: ArithmeticTree<T>,
  mode: CheckedRounding,
): ArithmeticTree<T>[] | undefined {
  const hasDivision = (t: ArithmeticTree<T>): boolean =>
    "op" in t &&
    (["/", "//"].includes(t.op) ||
      hasDivision(t.left) ||
      (!!t.right && hasDivision(t.right)));
  if (mode === "trunc") {
    const hasSlash = (t: ArithmeticTree<T>): boolean =>
      "op" in t &&
      (t.op === "/" || hasSlash(t.left) || (!!t.right && hasSlash(t.right)));
    if (hasSlash(tree))
      throw new ErrorException(
        "calc only accepts // for integer division; use calcFloor/calcCeil for rounded division",
      );
    return;
  }
  if ("op" in tree && tree.op === "/") {
    const parts =
      "op" in tree.left && tree.left.op === "*"
        ? [tree.left.left, tree.left.right!, tree.right!]
        : [tree.left, tree.right!];
    if (parts.some(hasDivision))
      throw new ErrorException(
        "Rounded checked arithmetic only supports a / b or a * b / c; use nested helpers for other divisions",
      );
    return parts;
  }
  if (hasDivision(tree))
    throw new ErrorException(
      "Rounded checked arithmetic only supports root /; // is not supported",
    );
}
export function evaluateCheckedExpression(
  tokens: unknown[],
  mode: CheckedRounding = "trunc",
): Num {
  const tree = parseCheckedExpression(
    tokens.map((value) =>
      typeof value === "string" &&
      (value in precedence || ["(", ")"].includes(value))
        ? { op: value }
        : { value },
    ),
  );
  const parts = roundedExpressionParts(tree, mode);
  const run = (t: ArithmeticTree<unknown>): CheckedInteger => {
    if ("value" in t) return checkedInteger(t.value);
    if (t.op === "neg")
      return checkedBinary("-", { value: 0n, signed: true }, run(t.left));
    if (
      t.op === "%" &&
      "op" in t.left &&
      (t.left.op === "+" || t.left.op === "*" || t.left.op === "^")
    )
      return checkedMod(
        t.left.op,
        run(t.left.left),
        run(t.left.right!),
        run(t.right!),
      );
    return checkedBinary(t.op, run(t.left), run(t.right!));
  };
  if (parts) {
    const values = parts.map(run);
    return checkedNum(
      checkedMulDiv(
        values[0],
        parts.length === 3 ? values[1] : { value: 1n, signed: false },
        values[values.length - 1],
        mode,
      ),
    );
  }
  return checkedNum(run(tree));
}
