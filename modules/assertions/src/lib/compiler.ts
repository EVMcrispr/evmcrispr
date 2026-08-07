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
  resolveHelper,
} from "@evmcrispr/sdk";
import type { AbiFunction, AbiParameter, Hex } from "viem";
import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  numberToHex,
  parseAbiItem,
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

// ---------------------------------------------------------------------------
//  Bang helpers (@name! — compiled to on-chain combinator calls)
// ---------------------------------------------------------------------------

/** The trailing `!` is the language convention for on-chain-evaluated
 *  helpers, so inside an assertion any `!`-named helper is compiled (via
 *  its definition's `compileAssert`) rather than interpreted at
 *  composition time. */
export function isBangHelperNode(node: Node): node is HelperFunctionNode {
  return (
    node.type === NodeType.HelperFunctionExpression &&
    (node as HelperFunctionNode).name.endsWith("!")
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

/** Non-final chain entries carry a 32-byte word-index prefix naming the
 *  return word that holds the next hop's address (the Combinators
 *  `_resolveChain` hop encoding). */
function prefixHop(wordIndex: number, data: Hex): Hex {
  return concatHex([numberToHex(wordIndex, { size: 32 }), data]);
}

const CHAIN_RESOLVE_ERROR =
  "could not resolve an intermediate chain target at build time to fetch its ABI — use the inline form ::{method(argTypes)(returnType)} for chained calls";

/** Resolve the address a chain prefix returns, via a build-time eth_call.
 *  Only needed to fetch the ABI of a named (non-inline) later hop. `calls`
 *  holds word-index-prefixed non-final entries. */
async function resolveChainAddress(
  ctx: CompilerCtx,
  root: Address,
  calls: Hex[],
): Promise<Address> {
  const client = await ctx.module.getClient();
  let addr = root;
  for (const entry of calls) {
    const wordIndex = Number.parseInt(entry.slice(2, 66), 16);
    const data = `0x${entry.slice(66)}` as Hex;
    let result: Hex | undefined;
    try {
      ({ data: result } = await client.call({ to: addr, data }));
    } catch {
      result = undefined;
    }
    const start = 2 + wordIndex * 64;
    if (!result || result.length < start + 64) {
      throw new ErrorException(CHAIN_RESOLVE_ERROR);
    }
    const word = result.slice(start, start + 64);
    if (!word.startsWith("0".repeat(24))) {
      throw new ErrorException(CHAIN_RESOLVE_ERROR);
    }
    addr = getAddress(`0x${word.slice(24)}`);
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
    const fnAbi = await hopAbi(ctx, hop, getAddress(root), calls);
    if (!fnAbi.outputs || fnAbi.outputs.length === 0) {
      throw new ErrorException(
        `${hop.method} has no return value to assert on`,
      );
    }
    let wordIndex = 0;
    if (!last) {
      if (hop.returnDestructure) {
        const hopPath = lensPath(hop.returnDestructure);
        if (hopPath.length > 1) {
          throw new ErrorException(
            `cannot chain through an array element of ${hop.method} — nested lenses like [[_ $]] apply only to the final call`,
          );
        }
        const index = hopPath[0];
        if (index >= fnAbi.outputs.length) {
          throw new ErrorException(
            `${hop.method} returns ${fnAbi.outputs.length} values; the lens selects value ${index + 1}`,
          );
        }
        const selected = fnAbi.outputs[index];
        if (selected.type !== "address") {
          throw new ErrorException(
            `a chained call must continue on an address; the lens on ${hop.method} selects ${selected.type}`,
          );
        }
        // Every output before the selection must occupy exactly one head
        // word (a static single-word value, or the offset of a dynamic
        // value) so the selected value's word index equals its position.
        for (let j = 0; j < index; j++) {
          const t = fnAbi.outputs[j].type;
          const singleWord =
            SINGLE_WORD_ABI.test(t) ||
            t === "string" ||
            t === "bytes" ||
            /\[\]$/.test(t);
          if (!singleWord) {
            throw new ErrorException(
              `cannot chain past a ${t} return value of ${hop.method} — it occupies several head words`,
            );
          }
        }
        wordIndex = index;
      } else if (
        fnAbi.outputs.length !== 1 ||
        fnAbi.outputs[0].type !== "address"
      ) {
        throw new ErrorException(
          `every chained call except the last must return a single address, or select one with a lens (e.g. ${hop.method}(...)[_ $ _]); ${hop.method} returns (${fnAbi.outputs.map((o) => o.type).join(", ")})`,
        );
      }
    }
    const argVals = await ctx.interpreters.interpretNodes(hop.args);
    const data = encodeCalldata(fnAbi, argVals);
    calls.push(last ? data : prefixHop(wordIndex, data));
    lastAbi = fnAbi;
  }

  return { root: getAddress(root), calls, lastAbi: lastAbi! };
}

/** Resolve a return-destructure lens into a navigation path: one index per
 *  nesting level. `[_ $ _]` = [1]; `[[_ $]]` = [0, 1] (element 1 of return
 *  value 0); `[[_ _ _ [_ $]]]` = [0, 3, 1]. Exactly one `$` overall. */
export function lensPath(slots: unknown[]): number[] {
  let path: number[] | undefined;
  const walk = (level: unknown[], prefix: number[]): void => {
    for (let i = 0; i < level.length; i++) {
      const slot = level[i];
      if (slot === "$") {
        if (path !== undefined) {
          throw new ErrorException(
            "an assertion lens must contain exactly one $ to select a value",
          );
        }
        path = [...prefix, i];
      } else if (Array.isArray(slot)) {
        walk(slot, [...prefix, i]);
      }
    }
  };
  walk(slots, []);
  if (path === undefined) {
    throw new ErrorException(
      "an assertion lens must contain a $ to select the return value",
    );
  }
  return path;
}

const SINGLE_WORD_ABI = /^(u?int\d*|address|bool|bytes32)$/;
const ARRAY_SUFFIX = /\[(\d*)\]$/;

/** Formats ABI output parameters as the parenthesized return-tuple
 *  descriptor navCall/navDynCall consume, structs written as parenthesized
 *  tuples: "((address,uint256)[],address)". */
export function formatReturnTuple(outputs: readonly AbiParameter[]): string {
  return `(${outputs.map(formatParamType).join(",")})`;
}

function formatParamType(p: AbiParameter): string {
  if (p.type.startsWith("tuple")) {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return `(${components.map(formatParamType).join(",")})${p.type.slice(5)}`;
  }
  return p.type;
}

/** Whether a parameter is ABI-dynamic (mirrors the combinator's shape rules). */
function isDynamicParam(p: AbiParameter): boolean {
  const suffix = p.type.match(ARRAY_SUFFIX);
  if (suffix) {
    if (suffix[1] === "") return true;
    return isDynamicParam({
      ...p,
      type: p.type.slice(0, -suffix[0].length),
    } as AbiParameter);
  }
  if (p.type === "bytes" || p.type === "string") return true;
  if (p.type === "tuple") {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return components.some(isDynamicParam);
  }
  return false;
}

/** Walks the ABI type tree along a lens path, validating every step the
 *  combinator will take at execution time, and returns the terminal type. */
function walkNavPath(
  outputs: readonly AbiParameter[],
  path: number[],
  method: string,
): AbiParameter {
  let current = { type: "tuple", components: outputs } as AbiParameter;
  for (const index of path) {
    const suffix = current.type.match(ARRAY_SUFFIX);
    if (suffix) {
      if (suffix[1] !== "" && index >= Number(suffix[1])) {
        throw new ErrorException(
          `index ${index} is out of range for the ${current.type} value in ${method}`,
        );
      }
      current = {
        ...current,
        type: current.type.slice(0, -suffix[0].length),
      } as AbiParameter;
    } else if (current.type === "tuple") {
      const components =
        (current as { components?: readonly AbiParameter[] }).components ?? [];
      if (index >= components.length) {
        throw new ErrorException(
          `component index ${index} is out of range (${components.length} value(s)) in ${method}`,
        );
      }
      current = components[index];
    } else {
      throw new ErrorException(
        `cannot select into a ${current.type} value of ${method} — the lens indexes tuples (structs) and arrays`,
      );
    }
  }
  return current;
}

/** Compile a lens selection into a navCall operand: the combinator derives
 *  every offset-follow and bounds check from the declared return type, so
 *  the calldata is self-describing — navCall(target, calls,
 *  "(address[][],address)", [0, 3, 1]) reads as "return value 0, element 3,
 *  element 1". */
function compileNavOperand(
  ctx: CompilerCtx,
  chain: Chain,
  path: number[],
  method: string,
): Operand {
  const outputs = chain.lastAbi.outputs!;
  const terminal = walkNavPath(outputs, path, method);
  if (!SINGLE_WORD_ABI.test(terminal.type)) {
    throw new ErrorException(
      `a value lens must land on a single-word static value; the selection in ${method} is ${terminal.type.startsWith("tuple") ? "a struct" : terminal.type}`,
    );
  }
  return {
    kind: "call",
    target: ctx.combinators,
    data: encodeCombinator("navCall", [
      chain.root,
      chain.calls,
      formatReturnTuple(outputs),
      path.map(BigInt),
    ]),
    cat: categoryFromAbiType(terminal.type),
  };
}

/** Compile a call expression used as a *nested* operand (inside an
 *  expression): a lens becomes a raw-word `uintCall` extraction. */
async function compileCallOperand(
  ctx: CompilerCtx,
  node: CallExpressionNode,
): Promise<Operand> {
  const chain = await compileChain(ctx, node);
  const outputs = chain.lastAbi.outputs!;

  if (node.returnDestructure) {
    const path = lensPath(node.returnDestructure);
    if (path.length > 1) {
      return compileNavOperand(ctx, chain, path, node.method);
    }
    const index = path[0];
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
    const path = lensPath(node.returnDestructure);
    if (path.length > 1) {
      // Navigated selections return a single decoded word, so the core
      // judges them as a plain (non-indexed) value of the terminal type.
      return {
        operand: compileNavOperand(ctx, chain, path, node.method),
      };
    }
    index = path[0];
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
export async function requireChainArg(
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

/** Compile the call argument of a chain-consuming helper that works on
 *  dynamic values (@len!, @bytelen!, @split!, @includes!, @charset!,
 *  @hash!). A lens on the call selects a nested string/bytes/array: the
 *  chain is rewrapped through navDynCall, whose canonical re-encoding the
 *  downstream combinator consumes as if the call had returned the selected
 *  value directly. */
export async function chainArgWithLens(
  ctx: CompilerCtx,
  helper: string,
  node: Node | undefined,
): Promise<Chain> {
  if (!node || node.type !== NodeType.CallExpression) {
    throw new ErrorException(
      `@${helper} expects a \`::\` call expression, e.g. @${helper}($target::method())`,
    );
  }
  const call = node as CallExpressionNode;
  const chain = await compileChain(ctx, call);
  if (!call.returnDestructure) return chain;

  const outputs = chain.lastAbi.outputs!;
  const path = lensPath(call.returnDestructure);
  const terminal = walkNavPath(outputs, path, call.method);
  const suffix = terminal.type.match(ARRAY_SUFFIX);
  const isDynArray = suffix?.[1] === "";
  if (!isDynArray && terminal.type !== "string" && terminal.type !== "bytes") {
    throw new ErrorException(
      `a lens inside @${helper} must select a string, bytes or array value; the selection in ${call.method} is ${terminal.type.startsWith("tuple") ? "a struct" : terminal.type}`,
    );
  }
  if (isDynArray) {
    const element = {
      ...terminal,
      type: terminal.type.slice(0, -2),
    } as AbiParameter;
    if (isDynamicParam(element)) {
      throw new ErrorException(
        `@${helper} can select arrays of static elements only; ${terminal.type} elements are dynamic`,
      );
    }
  }
  return {
    root: ctx.combinators,
    calls: [
      encodeCombinator("navDynCall", [
        chain.root,
        chain.calls,
        formatReturnTuple(outputs),
        path.map(BigInt),
      ]),
    ],
    lastAbi: {
      type: "function",
      name: "navDynCall",
      inputs: [],
      outputs: [terminal],
      stateMutability: "view",
    } as AbiFunction,
  };
}

/** Interpret a helper argument as a build-time integer constant
 *  (negative allowed — signed combinator indices resolve on-chain). */
export async function constIntArg(
  ctx: CompilerCtx,
  helper: string,
  what: string,
  node: Node | undefined,
): Promise<bigint> {
  if (!node)
    throw new ErrorException(`@${helper} is missing its ${what} argument`);
  const o = constOperand(await ctx.interpreters.interpretNode(node));
  return constBigInt(o as Operand & { kind: "const" });
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

  // Strings inside an expression: the word machine can't carry dynamic
  // values, so == / != compile to a keccak comparison — each live side is
  // wrapped in hashCall (keccak of its raw returndata, i.e. the ABI string
  // envelope) and constants fold to the digest of their own envelope at
  // build time. Ordering comparisons stay invalid.
  if (l.cat === "String" || r.cat === "String") {
    if (l.cat !== r.cat) {
      throw new ErrorException(
        "cannot compare a string with a non-string value",
      );
    }
    if (op !== "Eq" && op !== "Ne") {
      throw new ErrorException("strings only support == and != comparisons");
    }
    if (l.kind === "const" && r.kind === "const") {
      return {
        kind: "const",
        cat: "Bool",
        value: (l.value === r.value) === (op === "Eq"),
      };
    }
    const hashPair = (o: Operand): CallPair =>
      o.kind === "call"
        ? {
            target: ctx.combinators,
            data: encodeCombinator("hashCall", [o.target, [o.data]]),
          }
        : {
            target: ctx.combinators,
            data: encodeCombinator("constantUint", [
              BigInt(
                keccak256(
                  encodeAbiParameters(
                    [{ type: "string" }],
                    [o.value as string],
                  ),
                ),
              ),
            ]),
          };
    const lp = hashPair(l);
    const rp = hashPair(r);
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

/** Wrap combinator calldata as a call operand on the combinators contract. */
export function combinatorCall(
  ctx: CompilerCtx,
  data: Hex,
  cat: Category,
): Operand {
  return { kind: "call", target: ctx.combinators, data, cat };
}

/** Compile the (possibly array-wrapped) operand list of a variadic helper
 *  (@min!, @max!, @absdiff!). */
export async function variadicOperands(
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

/** Compile a `!` helper node into an operand by dispatching to its own
 *  definition's `compileAssert` (see helpers/_bang.ts) through the module's
 *  helper registry — the switch this replaces lived here; the logic now
 *  travels with each helper. */
export async function compileBangHelper(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
): Promise<Operand> {
  const entry = ctx.module.helpers[node.name];
  if (!entry) {
    throw new ErrorException(`unknown on-chain helper @${node.name}`);
  }
  const helper = await resolveHelper(entry);
  const compile = (
    helper as {
      compileAssert?: (
        ctx: CompilerCtx,
        node: HelperFunctionNode,
      ) => Promise<Operand>;
    }
  ).compileAssert;
  if (!compile) {
    throw new ErrorException(
      `@${node.name} does not support on-chain evaluation inside an assertion`,
    );
  }
  return compile(ctx, node);
}
