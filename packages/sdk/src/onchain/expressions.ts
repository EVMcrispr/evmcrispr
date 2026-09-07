import {
  type AbiParameter,
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  parseAbi,
} from "viem";
import { EXPRESSIONS_ADDRESS } from "./addresses";
import type { CompileCtx } from "./types";

/**
 * ABI of the Expressions periphery: typed expression graphs. A raw
 * ERC-8211 operand is a tree, so a value used twice is encoded and
 * resolved twice; an `Expression` is a graph whose nodes reference
 * earlier nodes by index, each evaluated at most once per evaluation and
 * validated against its declared `valueType`. Resolve-once call
 * construction is NOT here: the core's `get` and `gather` do that
 * in-frame (see `core.ts`).
 */
export const EXPRESSIONS_ABI = parseAbi([
  "struct Constraint { uint8 constraintType; bytes referenceData; }",
  "struct InputParam { uint8 paramType; uint8 fetcherType; bytes paramData; Constraint[] constraints; }",
  "struct Node { uint8 kind; string valueType; bytes data; uint256[] refs; bytes4 selector; string arguments; }",
  "struct Expression { address core; Node[] nodes; uint256 result; }",
  "function evaluate(Expression expression, bytes[] parameters) view",
  "function evaluateEncoded(bytes expression, bytes[] parameters) view",
  "error InvalidNode(uint256 node)",
  "error InvalidReference(uint256 node, uint256 ref)",
  "error InvalidTarget(uint256 node, address target)",
  "error NodeCallFailed(uint256 node, address target, bytes callData, bytes reason)",
  "error NotSelf(address caller)",
]);

/** The node kinds of an expression graph (`Expressions.Kind`). */
export const NODE_KIND = {
  Literal: 0,
  Parameter: 1,
  Resolve: 2,
  Call: 3,
  Select: 4,
  Wrap: 5,
  Array: 6,
  Tuple: 7,
  TryOrElse: 8,
  IsValid: 9,
  ProbeCall: 10,
} as const;

/** The `Expression` struct's ABI parameter, for encoding a graph as the
 *  bytes a `Collections.Callback.expression` carries. */
export const EXPRESSION_TYPE = (
  EXPRESSIONS_ABI.find(
    (f) => f.type === "function" && f.name === "evaluate",
  ) as { inputs: readonly AbiParameter[] }
).inputs[0];

export type ExpressionNode = {
  kind: number;
  valueType: string;
  data: Hex;
  refs: bigint[];
  selector: Hex;
  arguments: string;
};

export type Expression = {
  core: Address;
  nodes: ExpressionNode[];
  result: bigint;
};

/** `abi.encode(Expression)`: the form `evaluateEncoded` and a collection
 *  callback's `expression` field carry. */
export function encodeExpression(expression: Expression): Hex {
  return encodeAbiParameters([EXPRESSION_TYPE], [expression]);
}

/** Calldata for `evaluate(expression, parameters)`. */
export function encodeEvaluate(
  expression: Expression,
  parameters: readonly Hex[] = [],
): Hex {
  return encodeFunctionData({
    abi: EXPRESSIONS_ABI,
    functionName: "evaluate",
    args: [expression, [...parameters]],
  });
}

/** Where a compilation's graphs evaluate: the context's override or the
 *  canonical Expressions address. */
export function expressionsAddress(ctx: CompileCtx): Address {
  return ctx.expressions ?? EXPRESSIONS_ADDRESS;
}

/** A parameter's type in AbiCodec's descriptor grammar: tuples spelled
 *  as parenthesised component lists, arrays with their suffix. */
export function abiDescriptor(p: AbiParameter): string {
  return p.type.startsWith("tuple")
    ? `(${(p as { components: readonly AbiParameter[] }).components.map(abiDescriptor).join(",")})${p.type.slice(5)}`
    : p.type;
}

/** The argument tuple descriptor of a parameter list, e.g. `"(string,uint256)"`. */
export function argumentDescriptor(params: readonly AbiParameter[]): string {
  return `(${params.map(abiDescriptor).join(",")})`;
}
