import {
  ErrorException,
  Num,
  defineHelper,
  fieldItem,
  isNum,
} from "@evmcrispr/sdk";
import type Std from "..";

function isTruthy(value: unknown): boolean {
  if (value === "false" || value === "") return false;
  if (value instanceof Num) return !value.eq(new Num(0n));
  if (isNum(value)) return !Num.coerce(value).eq(new Num(0n));
  return Boolean(value);
}

function compare(
  left: unknown,
  operator: string,
  right: unknown,
): boolean {
  switch (operator) {
    case "==":
      if (isNum(left) && isNum(right)) {
        return Num.coerce(left).eq(Num.coerce(right));
      }
      return left === right;
    case "!=":
      if (isNum(left) && isNum(right)) {
        return !Num.coerce(left).eq(Num.coerce(right));
      }
      return left !== right;
    case ">":
    case ">=":
    case "<":
    case "<=": {
      if (!isNum(left) || !isNum(right)) {
        throw new ErrorException(
          `Operator ${operator} must be used between two numbers`,
        );
      }
      const a = Num.coerce(left);
      const b = Num.coerce(right);
      if (operator === ">") return a.gt(b);
      if (operator === ">=") return a.gte(b);
      if (operator === "<") return a.lt(b);
      return a.lte(b);
    }
    default:
      throw new ErrorException(`Operator ${operator} not recognized`);
  }
}

export default defineHelper<Std>({
  name: "bool",
  description:
    "Convert a value to a boolean or compare two values and return a boolean string.",
  returnType: "bool",
  args: [
    { name: "left", type: "any" },
    { name: "operator", type: "string", optional: true },
    { name: "right", type: "any", optional: true },
  ],
  completions: {
    operator: () => ["==", "!=", "<", "<=", ">", ">="].map(fieldItem),
  },
  async run(_, { left, operator, right }) {
    if (operator === undefined) {
      return isTruthy(left) ? "true" : "false";
    }
    return compare(left, operator, right) ? "true" : "false";
  },
});
