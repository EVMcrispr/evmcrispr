import { resolveToken } from "@evmcrispr/module-std";
import type {
  Address,
  CallExpressionNode,
  HelperFunctionNode,
  Module,
  Node,
  NodesInterpreters,
} from "@evmcrispr/sdk";
import {
  ErrorException,
  encodeCalldata,
  isNum,
  NodeType,
  Num,
} from "@evmcrispr/sdk";
import type { AbiFunction, Hex } from "viem";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  parseAbi,
  parseAbiItem,
  zeroAddress,
} from "viem";
import { loadFunctionAbi } from "./assertions";
import type { ArithOpName, CallPair, CmpOpName } from "./combinators";
import {
  ARITH_OP,
  BIT_OP,
  CMP_OP,
  encodeCombinator,
  LOGIC_OP,
} from "./combinators";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

/** Assertion value categories, keyed by the contract function name suffix. */
export type Category =
  | "Uint"
  | "Int"
  | "Address"
  | "Bool"
  | "Bytes32"
  | "String"
  | "Bytes";

export function categoryFromAbiType(abiType: string): Category {
  if (abiType.startsWith("uint")) return "Uint";
  if (abiType.startsWith("int")) return "Int";
  if (abiType === "address") return "Address";
  if (abiType === "bool") return "Bool";
  if (abiType === "bytes32") return "Bytes32";
  if (abiType === "string") return "String";
  if (abiType === "bytes") return "Bytes";
  throw new ErrorException(
    `unsupported return type "${abiType}" for an assertion. Supported: uint*/int*, address, bool, bytes32, bytes, string`,
  );
}

/**
 * A compiled expression operand: either a value known at build time, or a
 * `(target, calldata)` staticcall evaluated on-chain at assertion time.
 */
export type Operand =
  | { kind: "const"; cat: Category; value: Num | boolean | string }
  | {
      kind: "call";
      target: Address;
      data: Hex;
      cat: Category;
      /** When this call is `notBool(inner)`, the inner pair — lets the
       *  top level emit `assertFalse(inner)` instead of
       *  `assertTrue(notBool(inner))`. */
      notOf?: CallPair;
    };

export interface CompilerCtx {
  module: Module;
  interpreters: NodesInterpreters;
  /** Resolved combinators contract address. */
  combinators: Address;
}

/** A flattened `::` chain: `calls[0]` runs on `root`, later hops on the
 *  address returned by the previous one. */
export interface Chain {
  root: Address;
  calls: Hex[];
  lastAbi: AbiFunction;
}

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

// ---------------------------------------------------------------------------
//  Bang helpers (@name! — compiled to on-chain combinator calls)
// ---------------------------------------------------------------------------

export const BANG_HELPERS = new Set([
  "num!",
  "bool!",
  "balance!",
  "min!",
  "max!",
  "absdiff!",
  "timestamp!",
  "blocknumber!",
  "at!",
  "len!",
  "bytelen!",
  "split!",
  "hash!",
]);

export function isBangHelperNode(node: Node): node is HelperFunctionNode {
  return (
    node.type === NodeType.HelperFunctionExpression &&
    BANG_HELPERS.has((node as HelperFunctionNode).name)
  );
}

// ---------------------------------------------------------------------------
//  Const operands
// ---------------------------------------------------------------------------

function constOperand(value: unknown): Operand {
  if (typeof value === "boolean") return { kind: "const", cat: "Bool", value };
  if (value === "true" || value === "false")
    return { kind: "const", cat: "Bool", value: value === "true" };
  if (value instanceof Num || isNum(value)) {
    const num = value instanceof Num ? value : Num(value as any);
    const cat: Category = num.lt(Num(0n)) ? "Int" : "Uint";
    return { kind: "const", cat, value: num };
  }
  if (typeof value === "string") {
    if (isAddress(value))
      return { kind: "const", cat: "Address", value: getAddress(value) };
    if (isHex(value)) {
      return value.length === 66
        ? { kind: "const", cat: "Bytes32", value }
        : { kind: "const", cat: "Bytes", value };
    }
    return { kind: "const", cat: "String", value };
  }
  throw new ErrorException(
    `cannot use a value of type ${typeof value} in an assertion expression`,
  );
}

function isNumericCat(cat: Category): boolean {
  return cat === "Uint" || cat === "Int";
}

function constBigInt(o: Operand & { kind: "const" }): bigint {
  const v = o.value;
  if (typeof v === "boolean") return v ? 1n : 0n;
  if (v instanceof Num || isNum(v)) {
    const num = v instanceof Num ? v : Num(v as any);
    if (!num.isInteger()) {
      throw new ErrorException(
        "on-chain values are integers — scale fractional amounts to base units (e.g. wei) first",
      );
    }
    return num.toBigInt();
  }
  if (typeof v === "string" && isHex(v)) return BigInt(v);
  if (typeof v === "string" && isAddress(v)) return BigInt(getAddress(v));
  throw new ErrorException(
    `cannot use a ${o.cat} value as a number in an assertion expression`,
  );
}

/** Materialize an operand as a `(target, data)` pair for a combinator slot
 *  expecting a numeric (uint256/int256 word) operand. */
function materializeNumeric(ctx: CompilerCtx, o: Operand): CallPair {
  if (o.kind === "call") {
    if (o.cat === "Bool") {
      return {
        target: ctx.combinators,
        data: encodeCombinator("boolToUint", [o.target, o.data]),
      };
    }
    return { target: o.target, data: o.data };
  }
  const value = constBigInt(o);
  return value < 0n || o.cat === "Int"
    ? {
        target: ctx.combinators,
        data: encodeCombinator("constantInt", [value]),
      }
    : {
        target: ctx.combinators,
        data: encodeCombinator("constantUint", [value]),
      };
}

/** Materialize an operand as a bool-returning `(target, data)` pair. */
function materializeBool(ctx: CompilerCtx, o: Operand): CallPair {
  if (o.kind === "call") {
    if (o.cat !== "Bool") {
      throw new ErrorException(
        `expected a boolean operand, got a ${o.cat} value — compare it first (e.g. \`x > 0\`)`,
      );
    }
    return { target: o.target, data: o.data };
  }
  if (o.cat !== "Bool") {
    throw new ErrorException(
      `expected a boolean operand, got a ${o.cat} constant`,
    );
  }
  // The contract has no constantBool; a 0/1 uint word decodes as bool.
  return {
    target: ctx.combinators,
    data: encodeCombinator("constantUint", [o.value === true ? 1n : 0n]),
  };
}

// ---------------------------------------------------------------------------
//  Call expressions (`target::method(args)` and `::`-chains)
// ---------------------------------------------------------------------------

function flattenCallNodes(node: CallExpressionNode): {
  hops: CallExpressionNode[];
  rootTarget: Node;
} {
  const hops: CallExpressionNode[] = [];
  let cur: Node = node;
  while (cur.type === NodeType.CallExpression) {
    hops.unshift(cur as CallExpressionNode);
    cur = (cur as CallExpressionNode).target as Node;
  }
  return { hops, rootTarget: cur };
}

/** Resolve the address a chain prefix returns, via a build-time eth_call.
 *  Only needed to fetch the ABI of a named (non-inline) later hop. */
async function resolveChainAddress(
  ctx: CompilerCtx,
  root: Address,
  calls: Hex[],
): Promise<Address> {
  const client = await ctx.module.getClient();
  let addr = root;
  for (const data of calls) {
    let result: Hex | undefined;
    try {
      ({ data: result } = await client.call({ to: addr, data }));
    } catch {
      result = undefined;
    }
    if (!result || result.length < 66) {
      throw new ErrorException(
        "could not resolve an intermediate chain target at build time to fetch its ABI — use the inline form ::{method(argTypes)(returnType)} for chained calls",
      );
    }
    addr = getAddress(`0x${result.slice(-40)}`);
  }
  return addr;
}

async function hopAbi(
  ctx: CompilerCtx,
  hop: CallExpressionNode,
  root: Address,
  priorCalls: Hex[],
): Promise<AbiFunction> {
  if (hop.inputTypes && hop.outputTypes) {
    const sig = `function ${hop.method}${hop.inputTypes} view returns ${hop.outputTypes}`;
    return parseAbiItem(sig) as AbiFunction;
  }
  const addr =
    priorCalls.length === 0
      ? root
      : await resolveChainAddress(ctx, root, priorCalls);
  return loadFunctionAbi(ctx.module, addr, hop.method);
}

/** Compile a `::` call expression (possibly chained) into a Chain. */
export async function compileChain(
  ctx: CompilerCtx,
  node: CallExpressionNode,
): Promise<Chain> {
  const { hops, rootTarget } = flattenCallNodes(node);

  const root = await ctx.interpreters.interpretNode(rootTarget);
  if (typeof root !== "string" || !isAddress(root)) {
    throw new ErrorException(
      `assertion target must resolve to an address, got ${root}`,
    );
  }

  const calls: Hex[] = [];
  let lastAbi: AbiFunction | undefined;
  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    const last = i === hops.length - 1;
    if (hop.returnDestructure && !last) {
      throw new ErrorException(
        "a destructure lens is only supported on the final call of a chain",
      );
    }
    const fnAbi = await hopAbi(ctx, hop, getAddress(root), calls);
    if (!fnAbi.outputs || fnAbi.outputs.length === 0) {
      throw new ErrorException(
        `${hop.method} has no return value to assert on`,
      );
    }
    if (!last) {
      if (fnAbi.outputs.length !== 1 || fnAbi.outputs[0].type !== "address") {
        throw new ErrorException(
          `every chained call except the last must return a single address; ${hop.method} returns (${fnAbi.outputs.map((o) => o.type).join(", ")})`,
        );
      }
    }
    const argVals = await ctx.interpreters.interpretNodes(hop.args);
    calls.push(encodeCalldata(fnAbi, argVals));
    lastAbi = fnAbi;
  }

  return { root: getAddress(root), calls, lastAbi: lastAbi! };
}

/** Index of the single top-level `$` capture in a return-destructure lens. */
export function tupleIndexFromLens(slots: unknown[]): number {
  let index = -1;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === "$") {
      if (index !== -1) {
        throw new ErrorException(
          "an assertion lens must contain exactly one $ to select the return value",
        );
      }
      index = i;
    } else if (Array.isArray(slot)) {
      throw new ErrorException(
        "nested destructuring is not supported in assertions; use a single top-level $ to select a return value",
      );
    }
  }
  if (index === -1) {
    throw new ErrorException(
      "an assertion lens must contain a $ to select the return value",
    );
  }
  return index;
}

const SINGLE_WORD_ABI = /^(u?int\d*|address|bool|bytes32)$/;

/** Compile a call expression used as a *nested* operand (inside an
 *  expression): a lens becomes a raw-word `uintCall` extraction. */
async function compileCallOperand(
  ctx: CompilerCtx,
  node: CallExpressionNode,
): Promise<Operand> {
  const chain = await compileChain(ctx, node);
  const outputs = chain.lastAbi.outputs!;

  if (node.returnDestructure) {
    const index = tupleIndexFromLens(node.returnDestructure);
    const output = outputs[index];
    if (!output) {
      throw new ErrorException(
        `return index ${index} is out of range (${node.method} returns ${outputs.length} value(s))`,
      );
    }
    const cat = categoryFromAbiType(output.type);
    if (!isNumericCat(cat)) {
      throw new ErrorException(
        `a destructure lens inside an expression can only select uint/int values, got ${output.type}`,
      );
    }
    for (let i = 0; i < index; i++) {
      if (!SINGLE_WORD_ABI.test(outputs[i].type)) {
        throw new ErrorException(
          `cannot select return value ${index} inside an expression: preceding return value ${i} (${outputs[i].type}) is not a single-word static type`,
        );
      }
    }
    return {
      kind: "call",
      target: ctx.combinators,
      data: encodeCombinator("uintCall", [
        chain.root,
        chain.calls,
        BigInt(index),
      ]),
      cat,
    };
  }

  if (outputs.length > 1) {
    throw new ErrorException(
      `${node.method} returns multiple values; use a destructure lens to select one, e.g. \`${node.method}(...)[_ $ _]\``,
    );
  }
  const cat = categoryFromAbiType(outputs[0].type);

  if (chain.calls.length === 1) {
    return { kind: "call", target: chain.root, data: chain.calls[0], cat };
  }
  return {
    kind: "call",
    target: ctx.combinators,
    data: encodeCombinator("chainCall", [chain.root, chain.calls]),
    cat,
  };
}

/** Compile a call expression used as a *top-level* assertion side: a lens
 *  is kept as a tuple index so the core's `…N` variants can consume it. */
export async function compileTopCall(
  ctx: CompilerCtx,
  node: CallExpressionNode,
): Promise<{ operand: Operand; index?: number }> {
  const chain = await compileChain(ctx, node);
  const outputs = chain.lastAbi.outputs!;

  let index: number | undefined;
  let outputType: string;
  if (node.returnDestructure) {
    index = tupleIndexFromLens(node.returnDestructure);
    const output = outputs[index];
    if (!output) {
      throw new ErrorException(
        `return index ${index} is out of range (${node.method} returns ${outputs.length} value(s))`,
      );
    }
    outputType = output.type;
  } else {
    if (outputs.length > 1) {
      throw new ErrorException(
        `${node.method} returns multiple values; use a destructure lens to select one, e.g. \`${node.method}(...)[_ $ _]\``,
      );
    }
    outputType = outputs[0].type;
  }
  const cat = categoryFromAbiType(outputType);

  const operand: Operand =
    chain.calls.length === 1
      ? { kind: "call", target: chain.root, data: chain.calls[0], cat }
      : {
          kind: "call",
          target: ctx.combinators,
          data: encodeCombinator("chainCall", [chain.root, chain.calls]),
          cat,
        };
  return { operand, index };
}

// ---------------------------------------------------------------------------
//  Operand compilation (dispatch)
// ---------------------------------------------------------------------------

/** Compile any node into a nested-expression operand. */
export async function compileOperand(
  ctx: CompilerCtx,
  node: Node,
): Promise<Operand> {
  if (node.type === NodeType.CallExpression) {
    return compileCallOperand(ctx, node as CallExpressionNode);
  }
  if (isBangHelperNode(node)) {
    return compileBangHelper(ctx, node);
  }
  const value = await ctx.interpreters.interpretNode(node);
  return constOperand(value);
}

/** Compile the argument of a chain-call slot (@len!, @at!, …) — must be a
 *  `::` call expression or chain. */
async function requireChainArg(
  ctx: CompilerCtx,
  helper: string,
  node: Node | undefined,
): Promise<Chain> {
  if (!node || node.type !== NodeType.CallExpression) {
    throw new ErrorException(
      `@${helper} expects a \`::\` call expression, e.g. @${helper}($target::method())`,
    );
  }
  if ((node as CallExpressionNode).returnDestructure) {
    throw new ErrorException(
      `@${helper} does not support a destructure lens on its call`,
    );
  }
  return compileChain(ctx, node as CallExpressionNode);
}

async function constUintArg(
  ctx: CompilerCtx,
  helper: string,
  what: string,
  node: Node | undefined,
): Promise<bigint> {
  if (!node)
    throw new ErrorException(`@${helper} is missing its ${what} argument`);
  const o = constOperand(await ctx.interpreters.interpretNode(node));
  const v = constBigInt(o as Operand & { kind: "const" });
  if (v < 0n)
    throw new ErrorException(`@${helper} ${what} must be non-negative`);
  return v;
}

// ---------------------------------------------------------------------------
//  Arithmetic / comparison / logic composition
// ---------------------------------------------------------------------------

function foldArith(op: ArithOpName, l: bigint, r: bigint): bigint {
  switch (op) {
    case "Add":
      return l + r;
    case "Sub":
      return l - r;
    case "Mul":
      return l * r;
    case "Div":
      if (r === 0n) throw new ErrorException("division by zero");
      return l / r;
    case "Mod":
      if (r === 0n) throw new ErrorException("modulo by zero");
      return l % r;
    case "Exp":
      if (r < 0n) throw new ErrorException("negative exponent");
      return l ** r;
    case "Min":
      return l < r ? l : r;
    case "Max":
      return l > r ? l : r;
    case "AbsDiff":
      return l > r ? l - r : r - l;
  }
}

/** Combine two numeric operands with an arithmetic combinator, folding
 *  when both are build-time constants. */
export function arithCombine(
  ctx: CompilerCtx,
  op: ArithOpName,
  l: Operand,
  r: Operand,
): Operand {
  for (const o of [l, r]) {
    if (o.kind === "call" && !isNumericCat(o.cat) && o.cat !== "Bool") {
      throw new ErrorException(
        `arithmetic needs numeric operands, got a ${o.cat} value`,
      );
    }
  }
  if (l.kind === "const" && r.kind === "const") {
    const value = foldArith(op, constBigInt(l), constBigInt(r));
    return {
      kind: "const",
      cat: value < 0n ? "Int" : "Uint",
      value: Num.fromBigInt(value),
    };
  }
  const signed = l.cat === "Int" || r.cat === "Int";
  if (signed && op === "Exp") {
    throw new ErrorException(
      "exponentiation is not supported for int256 operands (calcInt rejects Exp)",
    );
  }
  const lp = materializeNumeric(ctx, l);
  const rp = materializeNumeric(ctx, r);
  return {
    kind: "call",
    target: ctx.combinators,
    data: encodeCombinator(signed ? "calcInt" : "calcUint", [
      ARITH_OP[op],
      lp.target,
      lp.data,
      rp.target,
      rp.data,
    ]),
    cat: signed ? "Int" : "Uint",
  };
}

function foldCmp(op: CmpOpName, l: bigint, r: bigint): boolean {
  switch (op) {
    case "Eq":
      return l === r;
    case "Ne":
      return l !== r;
    case "Gt":
      return l > r;
    case "Lt":
      return l < r;
    case "Ge":
      return l >= r;
    case "Le":
      return l <= r;
  }
}

/** Combine two operands with a comparison combinator (nested use). */
export function cmpCombine(
  ctx: CompilerCtx,
  op: CmpOpName,
  l: Operand,
  r: Operand,
): Operand {
  // Bool vs const bool: fold into the operand itself or its negation.
  if (l.cat === "Bool" || r.cat === "Bool") {
    if (op !== "Eq" && op !== "Ne") {
      throw new ErrorException(
        "boolean operands only support == and != comparisons",
      );
    }
    if (l.cat !== "Bool" || r.cat !== "Bool") {
      throw new ErrorException(
        "cannot compare a boolean with a non-boolean value",
      );
    }
    if (l.kind === "const" && r.kind === "const") {
      return {
        kind: "const",
        cat: "Bool",
        value: ((l.value === true) === (r.value === true)) === (op === "Eq"),
      };
    }
    if (l.kind === "const" || r.kind === "const") {
      const call = (l.kind === "call" ? l : r) as Operand & { kind: "call" };
      const cnst = (l.kind === "const" ? l : r) as Operand & { kind: "const" };
      const keep = (cnst.value === true) === (op === "Eq");
      return keep ? call : notCombine(ctx, call);
    }
    // Both live bools: raw 0/1 words compare exactly.
    const lp = materializeBool(ctx, l);
    const rp = materializeBool(ctx, r);
    return {
      kind: "call",
      target: ctx.combinators,
      data: encodeCombinator("cmpUint", [
        CMP_OP[op],
        lp.target,
        lp.data,
        rp.target,
        rp.data,
      ]),
      cat: "Bool",
    };
  }

  if (l.cat === "String" || r.cat === "String") {
    throw new ErrorException(
      "string values can only be compared at the top level of an assertion (or via @hash!)",
    );
  }
  if (
    (l.cat === "Address" ||
      l.cat === "Bytes32" ||
      r.cat === "Address" ||
      r.cat === "Bytes32") &&
    op !== "Eq" &&
    op !== "Ne"
  ) {
    throw new ErrorException(
      `${op === "Gt" || op === "Ge" ? ">" : "<"}-style comparisons need numeric operands`,
    );
  }
  if (l.kind === "const" && r.kind === "const") {
    return {
      kind: "const",
      cat: "Bool",
      value: foldCmp(op, constBigInt(l), constBigInt(r)),
    };
  }
  const signed = l.cat === "Int" || r.cat === "Int";
  const lp = materializeNumeric(ctx, l);
  const rp = materializeNumeric(ctx, r);
  return {
    kind: "call",
    target: ctx.combinators,
    data: encodeCombinator(signed ? "cmpInt" : "cmpUint", [
      CMP_OP[op],
      lp.target,
      lp.data,
      rp.target,
      rp.data,
    ]),
    cat: "Bool",
  };
}

/** Boolean negation: fold consts, wrap calls in `notBool`. */
export function notCombine(ctx: CompilerCtx, o: Operand): Operand {
  if (o.kind === "const") {
    if (o.cat !== "Bool")
      throw new ErrorException("`not` needs a boolean operand");
    return { kind: "const", cat: "Bool", value: o.value !== true };
  }
  const inner = materializeBool(ctx, o);
  return {
    kind: "call",
    target: ctx.combinators,
    data: encodeCombinator("notBool", [inner.target, inner.data]),
    cat: "Bool",
    notOf: inner,
  };
}

function logicCombine(
  ctx: CompilerCtx,
  op: "and" | "or" | "xor",
  l: Operand,
  r: Operand,
): Operand {
  // Numeric xor is bitwise.
  if (op === "xor" && isNumericCat(l.cat) && isNumericCat(r.cat)) {
    if (l.kind === "const" && r.kind === "const") {
      const value = constBigInt(l) ^ constBigInt(r);
      return { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
    }
    const lp = materializeNumeric(ctx, l);
    const rp = materializeNumeric(ctx, r);
    return {
      kind: "call",
      target: ctx.combinators,
      data: encodeCombinator("bitUint", [
        BIT_OP.Xor,
        lp.target,
        lp.data,
        rp.target,
        rp.data,
      ]),
      cat: "Uint",
    };
  }

  const toBool = (o: Operand): Operand => {
    if (o.cat === "Bool") return o;
    throw new ErrorException(
      `'${op}' needs boolean operands — compare values first (e.g. \`x > 0 ${op} y > 0\`)`,
    );
  };
  const lb = toBool(l);
  const rb = toBool(r);

  // Partial constant folding.
  if (lb.kind === "const" || rb.kind === "const") {
    const cnst = (lb.kind === "const" ? lb : rb) as Operand & {
      kind: "const";
    };
    const other = lb.kind === "const" ? rb : lb;
    const cv = cnst.value === true;
    if (other.kind === "const") {
      const ov = other.value === true;
      const value =
        op === "and" ? cv && ov : op === "or" ? cv || ov : cv !== ov;
      return { kind: "const", cat: "Bool", value };
    }
    if (op === "and")
      return cv ? other : { kind: "const", cat: "Bool", value: false };
    if (op === "or")
      return cv ? { kind: "const", cat: "Bool", value: true } : other;
    return cv ? notCombine(ctx, other) : other;
  }

  const lp = materializeBool(ctx, lb);
  const rp = materializeBool(ctx, rb);
  const logicOp =
    op === "and" ? LOGIC_OP.And : op === "or" ? LOGIC_OP.Or : LOGIC_OP.Xor;
  return {
    kind: "call",
    target: ctx.combinators,
    data: encodeCombinator("logicBool", [
      logicOp,
      lp.target,
      lp.data,
      rp.target,
      rp.data,
    ]),
    cat: "Bool",
  };
}

// ---------------------------------------------------------------------------
//  Shunting-yard over raw nodes (@num! / @bool!)
// ---------------------------------------------------------------------------

interface OpInfo {
  prec: number;
  assoc: "left" | "right";
  arity: "binary" | "prefix";
}

const ARITH_SYMBOL: Record<string, ArithOpName> = {
  "+": "Add",
  "-": "Sub",
  "*": "Mul",
  "/": "Div",
  "//": "Div",
  "%": "Mod",
  "^": "Exp",
};

const CMP_SYMBOL: Record<string, CmpOpName> = {
  "==": "Eq",
  "!=": "Ne",
  ">": "Gt",
  "<": "Lt",
  ">=": "Ge",
  "<=": "Le",
};

const NUM_OPS: Record<string, OpInfo> = {
  xor: { prec: 1, assoc: "left", arity: "binary" },
  "+": { prec: 2, assoc: "left", arity: "binary" },
  "-": { prec: 2, assoc: "left", arity: "binary" },
  "*": { prec: 3, assoc: "left", arity: "binary" },
  "/": { prec: 3, assoc: "left", arity: "binary" },
  "//": { prec: 3, assoc: "left", arity: "binary" },
  "%": { prec: 3, assoc: "left", arity: "binary" },
  "^": { prec: 4, assoc: "right", arity: "binary" },
};

const BOOL_OPS: Record<string, OpInfo> = {
  or: { prec: 1, assoc: "left", arity: "binary" },
  xor: { prec: 2, assoc: "left", arity: "binary" },
  and: { prec: 3, assoc: "left", arity: "binary" },
  not: { prec: 4, assoc: "right", arity: "prefix" },
  "==": { prec: 5, assoc: "left", arity: "binary" },
  "!=": { prec: 5, assoc: "left", arity: "binary" },
  "<": { prec: 5, assoc: "left", arity: "binary" },
  "<=": { prec: 5, assoc: "left", arity: "binary" },
  ">": { prec: 5, assoc: "left", arity: "binary" },
  ">=": { prec: 5, assoc: "left", arity: "binary" },
};

const NUM_OP_SET = new Set(Object.keys(NUM_OPS));
const BOOL_OP_SET = new Set(Object.keys(BOOL_OPS));

const OPERATOR_CHARS = /[+\-*/%^<>=!]/;

/** Detect `($a>0)`-style barewords where operator spacing is missing. */
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
      const hasAfter =
        i + op.length < token.length &&
        !OPERATOR_CHARS.test(token[i + op.length]);
      if (hasBefore && hasAfter) {
        const spaced = `${token.slice(0, i)} ${op} ${token.slice(i + op.length)}`;
        throw new ErrorException(
          `Missing spaces around operator '${op}': did you mean '${spaced.trim()}'?`,
        );
      }
    }
  }
}

const UNARY_MINUS = "unary-";
const PREFIX_PREC: Record<string, number> = { [UNARY_MINUS]: 10, not: 4 };

type ExprToken = { op: string } | { operand: Operand };

async function tokenize(
  ctx: CompilerCtx,
  nodes: Node[],
  ops: Set<string>,
  label: string,
  rejected: Set<string>,
  rejectedHint: string,
): Promise<ExprToken[]> {
  const tokens: ExprToken[] = [];
  for (const node of nodes) {
    if (node.type === NodeType.Bareword) {
      const value = String((node as any).value);
      if (value === "(" || value === ")" || ops.has(value)) {
        tokens.push({ op: value });
        continue;
      }
      if (rejected.has(value)) {
        throw new ErrorException(
          `Operator '${value}' is not valid in ${label}. ${rejectedHint}`,
        );
      }
      detectMissingSpaces(value, ops);
    }
    tokens.push({ operand: await compileOperand(ctx, node) });
  }
  return tokens;
}

function applyOp(
  ctx: CompilerCtx,
  op: string,
  output: Operand[],
  mode: "num" | "bool",
): void {
  if (op === UNARY_MINUS || op === "not") {
    if (output.length < 1)
      throw new ErrorException(`Missing operand for '${op}'`);
    const operand = output.pop()!;
    if (op === "not") {
      output.push(notCombine(ctx, operand));
    } else {
      output.push(
        arithCombine(
          ctx,
          "Sub",
          { kind: "const", cat: "Int", value: Num.fromBigInt(0n) },
          operand,
        ),
      );
    }
    return;
  }
  if (output.length < 2)
    throw new ErrorException(`Missing operand for '${op}'`);
  const r = output.pop()!;
  const l = output.pop()!;
  if (op in ARITH_SYMBOL && mode === "num") {
    output.push(arithCombine(ctx, ARITH_SYMBOL[op], l, r));
  } else if (op in CMP_SYMBOL) {
    output.push(cmpCombine(ctx, CMP_SYMBOL[op], l, r));
  } else if (op === "and" || op === "or" || op === "xor") {
    output.push(logicCombine(ctx, op, l, r));
  } else {
    throw new ErrorException(`Unknown operator '${op}'`);
  }
}

function shouldPop(
  stackOp: string,
  currentOp: string,
  ops: Record<string, OpInfo>,
): boolean {
  if (stackOp in PREFIX_PREC) {
    const c = ops[currentOp];
    if (!c) return false;
    return PREFIX_PREC[stackOp] >= c.prec;
  }
  const s = ops[stackOp];
  const c = ops[currentOp];
  if (!s || !c) return false;
  if (c.assoc === "left") return s.prec >= c.prec;
  return s.prec > c.prec;
}

function evaluateTokens(
  ctx: CompilerCtx,
  tokens: ExprToken[],
  ops: Record<string, OpInfo>,
  mode: "num" | "bool",
  label: string,
): Operand {
  const output: Operand[] = [];
  const opStack: string[] = [];
  let prevWasValue = false;

  for (const token of tokens) {
    if ("operand" in token) {
      output.push(token.operand);
      prevWasValue = true;
      continue;
    }
    const op = token.op;
    if (op === "(") {
      opStack.push("(");
      prevWasValue = false;
      continue;
    }
    if (op === ")") {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== "(") {
        applyOp(ctx, opStack.pop()!, output, mode);
      }
      if (opStack.length === 0)
        throw new ErrorException("Mismatched parentheses");
      opStack.pop();
      prevWasValue = true;
      continue;
    }

    const isUnaryMinus = op === "-" && !prevWasValue && mode === "num";
    const isPrefix = ops[op]?.arity === "prefix";
    if ((isPrefix || isUnaryMinus) && !prevWasValue) {
      opStack.push(isUnaryMinus ? UNARY_MINUS : op);
      prevWasValue = false;
      continue;
    }

    if (!ops[op]) {
      throw new ErrorException(`Operator '${op}' is not valid in ${label}`);
    }
    while (
      opStack.length > 0 &&
      opStack[opStack.length - 1] !== "(" &&
      shouldPop(opStack[opStack.length - 1], op, ops)
    ) {
      applyOp(ctx, opStack.pop()!, output, mode);
    }
    opStack.push(op);
    prevWasValue = false;
  }

  while (opStack.length > 0) {
    if (opStack[opStack.length - 1] === "(")
      throw new ErrorException("Mismatched parentheses");
    applyOp(ctx, opStack.pop()!, output, mode);
  }

  if (output.length !== 1) {
    throw new ErrorException(`Invalid ${label} expression`);
  }
  return output[0];
}

/** Compile the raw argument nodes of `@num!(…)` / `@bool!(…)`. */
export async function compileExpr(
  ctx: CompilerCtx,
  nodes: Node[],
  mode: "num" | "bool",
): Promise<Operand> {
  const label = mode === "num" ? "@num!" : "@bool!";
  if (nodes.length === 0) {
    throw new ErrorException(`${label} requires at least one argument`);
  }
  const [ops, opSet, rejected, hint] =
    mode === "num"
      ? ([
          NUM_OPS,
          NUM_OP_SET,
          new Set([...BOOL_OP_SET].filter((o) => !NUM_OP_SET.has(o))),
          "Use @bool!(...) for comparisons and logic.",
        ] as const)
      : ([
          BOOL_OPS,
          BOOL_OP_SET,
          new Set([...NUM_OP_SET].filter((o) => !BOOL_OP_SET.has(o))),
          "Use @num!(...) for arithmetic.",
        ] as const);

  const tokens = await tokenize(ctx, nodes, opSet, label, rejected, hint);
  const result = evaluateTokens(ctx, tokens, ops, mode, label);

  if (mode === "num" && !isNumericCat(result.cat)) {
    throw new ErrorException(`${label} must evaluate to a numeric value`);
  }
  if (mode === "bool" && result.cat !== "Bool") {
    throw new ErrorException(`${label} must evaluate to a boolean value`);
  }
  return result;
}

// ---------------------------------------------------------------------------
//  Bang helper compilation
// ---------------------------------------------------------------------------

function combinatorCall(ctx: CompilerCtx, data: Hex, cat: Category): Operand {
  return { kind: "call", target: ctx.combinators, data, cat };
}

/** Compile `@split!(call delim idx)` into its splitCall calldata. */
export async function compileSplit(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
): Promise<Hex> {
  if (node.args.length !== 3) {
    throw new ErrorException(
      '@split! expects (call delimiter index), e.g. @split!($pool::name() " " 1)',
    );
  }
  const chain = await requireChainArg(ctx, "split!", node.args[0]);
  const delimiter = await ctx.interpreters.interpretNode(node.args[1]);
  if (typeof delimiter !== "string" || delimiter.length === 0) {
    throw new ErrorException("@split! delimiter must be a non-empty string");
  }
  const index = await constUintArg(ctx, "split!", "index", node.args[2]);
  return encodeCombinator("splitCall", [
    chain.root,
    chain.calls,
    delimiter,
    index,
  ]);
}

/** Compile `@hash!(call)` into its hashCall calldata. */
export async function compileHash(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
): Promise<Hex> {
  if (node.args.length !== 1) {
    throw new ErrorException("@hash! expects a single call argument");
  }
  const chain = await requireChainArg(ctx, "hash!", node.args[0]);
  return encodeCombinator("hashCall", [chain.root, chain.calls]);
}

/** Compile `@len!(call)` into the chain it measures. Used both by the
 *  top-level array-length fast path and the nested arrayLengthCall form. */
export async function compileLenChain(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
): Promise<Chain> {
  if (node.args.length !== 1) {
    throw new ErrorException("@len! expects a single call argument");
  }
  return requireChainArg(ctx, "len!", node.args[0]);
}

async function compileBalance(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
): Promise<Operand> {
  if (node.args.length !== 2) {
    throw new ErrorException(
      "@balance! expects (token account), e.g. @balance!(ETH @me) or @balance!(WETH @me)",
    );
  }
  const [tokenNode, accountNode] = node.args;
  const tokenValue = await ctx.interpreters.interpretNode(tokenNode);
  const tokenAddr = await resolveToken(ctx.module as never, String(tokenValue));
  const native = tokenAddr === zeroAddress;

  if (accountNode.type === NodeType.CallExpression) {
    if (!native) {
      throw new ErrorException(
        "@balance! with a call-resolved account only supports the native token (ETH) — the combinators contract cannot route a resolved address into balanceOf",
      );
    }
    const chain = await requireChainArg(ctx, "balance!", accountNode);
    const out = chain.lastAbi.outputs?.[0];
    if (chain.lastAbi.outputs?.length !== 1 || out?.type !== "address") {
      throw new ErrorException(
        "@balance! account call must return a single address",
      );
    }
    return combinatorCall(
      ctx,
      encodeCombinator("ethBalanceCall", [chain.root, chain.calls]),
      "Uint",
    );
  }

  const account = await ctx.interpreters.interpretNode(accountNode);
  if (typeof account !== "string" || !isAddress(account)) {
    throw new ErrorException(
      `@balance! account must resolve to an address, got ${account}`,
    );
  }
  if (native) {
    return combinatorCall(
      ctx,
      encodeCombinator("ethBalance", [getAddress(account)]),
      "Uint",
    );
  }
  return {
    kind: "call",
    target: tokenAddr,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [getAddress(account)],
    }),
    cat: "Uint",
  };
}

async function variadicOperands(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
  helper: string,
): Promise<Operand[]> {
  let argNodes: Node[] = node.args as unknown as Node[];
  if (argNodes.length === 1 && argNodes[0].type === NodeType.ArrayExpression) {
    argNodes = (argNodes[0] as any).elements as Node[];
  }
  if (argNodes.length < 2) {
    throw new ErrorException(`@${helper} needs at least two operands`);
  }
  return Promise.all(argNodes.map((n) => compileOperand(ctx, n)));
}

/** Compile a `!` helper node into an operand (nested-expression position). */
export async function compileBangHelper(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
): Promise<Operand> {
  switch (node.name) {
    case "num!":
      return compileExpr(ctx, node.args, "num");
    case "bool!":
      return compileExpr(ctx, node.args, "bool");
    case "balance!":
      return compileBalance(ctx, node);
    case "timestamp!": {
      if (node.args.length > 0)
        throw new ErrorException("@timestamp! takes no arguments");
      return combinatorCall(
        ctx,
        encodeCombinator("blockTimestamp", []),
        "Uint",
      );
    }
    case "blocknumber!": {
      if (node.args.length > 0)
        throw new ErrorException("@blocknumber! takes no arguments");
      return combinatorCall(ctx, encodeCombinator("blockNumber", []), "Uint");
    }
    case "min!":
    case "max!": {
      const op: ArithOpName = node.name === "min!" ? "Min" : "Max";
      const operands = await variadicOperands(ctx, node, node.name);
      return operands.reduce((acc, o) => arithCombine(ctx, op, acc, o));
    }
    case "absdiff!": {
      const operands = await variadicOperands(ctx, node, "absdiff!");
      if (operands.length !== 2) {
        throw new ErrorException("@absdiff! takes exactly two operands");
      }
      return arithCombine(ctx, "AbsDiff", operands[0], operands[1]);
    }
    case "at!": {
      if (node.args.length !== 2) {
        throw new ErrorException(
          "@at! expects (call wordIndex), e.g. @at!($pool::getReserves() 1)",
        );
      }
      const chain = await requireChainArg(ctx, "at!", node.args[0]);
      const index = await constUintArg(ctx, "at!", "word index", node.args[1]);
      return combinatorCall(
        ctx,
        encodeCombinator("uintCall", [chain.root, chain.calls, index]),
        "Uint",
      );
    }
    case "len!": {
      const chain = await compileLenChain(ctx, node);
      return combinatorCall(
        ctx,
        encodeCombinator("arrayLengthCall", [chain.root, chain.calls]),
        "Uint",
      );
    }
    case "bytelen!": {
      if (node.args.length !== 1) {
        throw new ErrorException("@bytelen! expects a single call argument");
      }
      const chain = await requireChainArg(ctx, "bytelen!", node.args[0]);
      return combinatorCall(
        ctx,
        encodeCombinator("lengthCall", [chain.root, chain.calls]),
        "Uint",
      );
    }
    case "split!":
      throw new ErrorException(
        "@split! is string-valued and can only be compared at the top level of an assertion",
      );
    case "hash!": {
      const data = await compileHash(ctx, node);
      return combinatorCall(ctx, data, "Bytes32");
    }
    default:
      throw new ErrorException(`unknown on-chain helper @${node.name}`);
  }
}
