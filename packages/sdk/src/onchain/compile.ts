import type { AbiFunction, AbiParameter, Hex } from "viem";
import {
  decodeAbiParameters,
  getAbiItem,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  parseAbiItem,
  stringToHex,
} from "viem";
import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type {
  Abi,
  Address,
  CallExpressionNode,
  HelperFunctionNode,
  Node,
} from "../types";
import { BindingsSpace, NodeType } from "../types";
import { abiBindingKey, fetchAbi } from "../utils/abis";
import { isNum } from "../utils/args";
import { encodeCalldata } from "../utils/encoders";
import { rpow } from "../utils/fixed";
import { Num } from "../utils/Num";
import type { ArithOpName, CmpOpName, LogicOpName } from "./composition";
import {
  ARITH_FN,
  ARITH_SYMBOL,
  arithRejects,
  CMP_FN,
  CMP_SYMBOL,
  checkArith,
  checkCmp,
  checkLogic,
  isNumericCat,
  LOGIC_FN,
} from "./composition";
import type { ArgSpec, ReadCall } from "./construct";
import { buildCallSegments, isDynamicParam } from "./construct";
import {
  encodeChain,
  encodeNav,
  encodeOpRead,
  encodePick,
  encodeRead,
  LEN_STEP,
} from "./core";
import { compileOnchainHelper, isBangHelperNode } from "./dispatch";
import type { Constraint, InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";
import { OP_SELECTORS, opSelector } from "./operators";
import type { Category, CompileCtx, Operand } from "./types";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type { ArithOpName, CmpOpName } from "./composition";
/** Re-exported from the construct layer (shared ABI shape rules). */
export { isDynamicParam } from "./construct";
/** Re-exported from the pure-types module and the composition table (the
 *  single source of truth for categories and operator acceptance). */
export type { Category, CompileCtx, Operand } from "./types";

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

/** A flattened `::` chain as the core's `chain` consumes it: `start`
 *  resolves to the first hop's target, `calls[i]` runs on the previous
 *  hop's first return word. */
export interface Chain {
  /** InputParam resolving to the first hop's target address. */
  start: InputParam;
  /** Set when `start` is a literal address (single-hop shortcut + ABI
   *  fetching for named hops). */
  startAddress?: Address;
  /** Plain abi.encodeCall entries, one per hop. */
  calls: Hex[];
  lastAbi: AbiFunction;
  /** Set once a hop with live arguments was folded into `start` as a
   *  `read` param — build-time address resolution stops there. */
  liveArgs?: boolean;
}

/** Express a chain as a single InputParam: a read-terminated chain's
 *  value is `start` itself, a one-hop chain rooted at a literal address is
 *  the call itself; anything longer routes through the core's `chain`. */
export function chainParam(ctx: CompileCtx, chain: Chain): InputParam {
  if (chain.calls.length === 0) {
    return chain.start;
  }
  if (chain.calls.length === 1 && chain.startAddress) {
    return staticCallParam(chain.startAddress, chain.calls[0]);
  }
  return staticCallParam(ctx.core, encodeChain(chain.start, chain.calls));
}

// ---------------------------------------------------------------------------
//  Operator composition primitives (core read splicing)
// ---------------------------------------------------------------------------

/** An Operators call composed from unresolved operands, as an InputParam:
 *  `read(operators, selector, args)` calldata at the CORE address — the
 *  core resolves each operand, splices the values after the selector and
 *  staticcalls the Operators contract. */
export function opReadParam(
  ctx: CompileCtx,
  selector: Hex,
  args: readonly InputParam[],
  constraints: Constraint[] = [],
): InputParam {
  return staticCallParam(
    ctx.core,
    encodeOpRead(ctx.operators, selector, args),
    constraints,
  );
}

/** A binary word-operator call over two operands, picking the int256
 *  overload when `signed` and the operator has one. */
export function wordOpParam(
  ctx: CompileCtx,
  fn: string,
  signed: boolean,
  a: InputParam,
  b: InputParam,
): InputParam {
  return opReadParam(ctx, opSelector(fn, signed), [a, b]);
}

/** `hash(value)` — keccak256 of the DECODED payload of a string/bytes
 *  operand: the resolved envelope [0x20][len][payload] is spliced as the
 *  single `bytes` argument, so the digest covers the payload itself
 *  (keccak256 of the string bytes, not of the ABI envelope). */
export function hashParamOf(ctx: CompileCtx, value: InputParam): InputParam {
  return opReadParam(ctx, OP_SELECTORS.hash, [value]);
}

/** `parseUint(bytes)` over a spliced live string return — the bridge from
 *  decimal string values into arithmetic (the digest of a version
 *  segment, a numeric symbol suffix, ...). */
export function parseUintParamOf(
  ctx: CompileCtx,
  value: InputParam,
): InputParam {
  return opReadParam(ctx, OP_SELECTORS.parseUint, [value]);
}

/** `byteLen(value)` — the DECODED byte length of a string/bytes operand
 *  (its envelope spliced as the single `bytes` argument). */
export function byteLenParamOf(ctx: CompileCtx, value: InputParam): InputParam {
  return opReadParam(ctx, OP_SELECTORS.byteLen, [value]);
}

// ---------------------------------------------------------------------------
//  Const operands
// ---------------------------------------------------------------------------

export function constOperand(value: unknown): Operand {
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

/**
 * How a fractional constant resolves to its word.
 *
 * `exact` is the default and the only safe choice inside arithmetic: there
 * is no integer answer to `x + 0.5`, so it errors. A comparison against an
 * integer-valued operand DOES have an exact integer form, because rounding
 * the bound in the direction the predicate points preserves the predicate
 * (`x >= 0.5` ⟺ `x >= 1`); those callers pass `floor`/`ceil`.
 */
export type ConstRounding = "exact" | "floor" | "ceil";

export function constBigInt(
  o: Operand & { kind: "const" },
  rounding: ConstRounding = "exact",
): bigint {
  const v = o.value;
  if (typeof v === "boolean") return v ? 1n : 0n;
  if (v instanceof Num || isNum(v)) {
    const num = v instanceof Num ? v : Num(v as any);
    if (!num.isInteger()) {
      if (rounding === "floor") return num.floorBigInt();
      if (rounding === "ceil") return num.ceilBigInt();
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

/** Materialize an operand as an InputParam for an operator slot reading a
 *  raw 32-byte word. Live params pass through untouched — bool returns are
 *  0/1 words and signed returns are two's-complement words, so no
 *  conversion is ever needed; constants become RAW_BYTES literal words
 *  with negative values encoded as their two's-complement word. */
export function materializeWord(_ctx: CompileCtx, o: Operand): InputParam {
  if (o.kind === "call") return o.param;
  return rawParam(toWord(constBigInt(o)));
}

/** Materialize an operand as a bool-word InputParam. */
function materializeBool(_ctx: CompileCtx, o: Operand): InputParam {
  if (o.kind === "call") {
    if (o.cat !== "Bool") {
      throw new ErrorException(
        `expected a boolean operand, got a ${o.cat} value — compare it first (e.g. \`x > 0\`)`,
      );
    }
    return o.param;
  }
  if (o.cat !== "Bool") {
    throw new ErrorException(
      `expected a boolean operand, got a ${o.cat} constant`,
    );
  }
  // A 0/1 raw word decodes as bool.
  return rawParam(toWord(o.value === true ? 1n : 0n));
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

const CHAIN_RESOLVE_ERROR =
  "could not resolve an intermediate chain target at build time to fetch its ABI — use the inline form ::{method(argTypes)(returnType)} for chained calls";

/** Resolve the address a chain prefix returns, via a build-time eth_call.
 *  Only needed to fetch the ABI of a named (non-inline) later hop. A prefix
 *  carrying live arguments (a read param) cannot be resolved at build
 *  time — the core evaluating it is a judge-time dependency. */
async function resolveChainAddress(
  ctx: CompileCtx,
  start: InputParam,
  startAddress: Address | undefined,
  calls: Hex[],
  liveArgs: boolean | undefined,
): Promise<Address> {
  if (liveArgs) {
    throw new ErrorException(CHAIN_RESOLVE_ERROR);
  }
  const client = await ctx.module.getClient();

  const callWord0 = async (to: Address, data: Hex): Promise<Address> => {
    let result: Hex | undefined;
    try {
      ({ data: result } = await client.call({ to, data }));
    } catch {
      result = undefined;
    }
    if (!result || result.length < 2 + 64) {
      throw new ErrorException(CHAIN_RESOLVE_ERROR);
    }
    const word = result.slice(2, 2 + 64);
    if (!word.startsWith("0".repeat(24))) {
      throw new ErrorException(CHAIN_RESOLVE_ERROR);
    }
    return getAddress(`0x${word.slice(24)}`);
  };

  let addr: Address;
  if (startAddress) {
    addr = startAddress;
  } else if (start.fetcherType === 1) {
    // STATIC_CALL start: run the wrapped prefix expression off-chain.
    const [to, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      start.paramData,
    ) as [Address, Hex];
    addr = await callWord0(to, data);
  } else {
    // RAW_BYTES start carrying the address word.
    addr = getAddress(`0x${start.paramData.slice(2 + 24, 2 + 64)}`);
  }
  for (const call of calls) {
    addr = await callWord0(addr, call);
  }
  return addr;
}

async function hopAbi(
  ctx: CompileCtx,
  hop: CallExpressionNode,
  chain: Pick<Chain, "start" | "startAddress" | "calls" | "liveArgs">,
): Promise<AbiFunction> {
  if (hop.inputTypes && hop.outputTypes) {
    const sig = `function ${hop.method}${hop.inputTypes} view returns ${hop.outputTypes}`;
    return parseAbiItem(sig) as AbiFunction;
  }
  const addr =
    chain.calls.length === 0 && chain.startAddress
      ? chain.startAddress
      : await resolveChainAddress(
          ctx,
          chain.start,
          chain.startAddress,
          chain.calls,
          chain.liveArgs,
        );
  return loadFunctionAbi(ctx.module, addr, hop.method);
}

/** Compile an argument node list into ArgSpecs, turning nested `::` calls
 *  and `!` helpers into live params and interpreting everything else at
 *  build time. Shared by plain hop compilation and `!::` read hops. */
export async function compileArgSpecs(
  ctx: CompileCtx,
  argNodes: readonly Node[],
  fnAbi: AbiFunction,
  method: string,
): Promise<ArgSpec[]> {
  if (argNodes.length !== fnAbi.inputs.length) {
    throw new ErrorException(
      `${method} expects ${fnAbi.inputs.length} argument(s), got ${argNodes.length}`,
    );
  }
  const specs: ArgSpec[] = [];
  for (let i = 0; i < argNodes.length; i++) {
    const arg = argNodes[i];
    const input = fnAbi.inputs[i];
    if (arg.type === NodeType.CallExpression) {
      specs.push(
        await compileLiveCallArg(ctx, arg as CallExpressionNode, input, method),
      );
    } else if (isBangHelperNode(arg)) {
      specs.push(await compileLiveHelperArg(ctx, arg, input, method));
    } else {
      specs.push({
        kind: "value",
        value: (await ctx.interpreters.interpretNode(arg)) as never,
      });
    }
  }
  return specs;
}

/** A compiled hop: plain fixed calldata, or — when any argument is live —
 *  a read construction the chain folds into its `start`. */
type CompiledHop =
  | { kind: "plain"; data: Hex }
  | { kind: "read"; call: ReadCall };

/** Compile a hop's argument list. A `!::` hop always compiles as a read
 *  construction — its target is a spliced operand, never a fixed address,
 *  so there is no plain-calldata shortcut. */
async function compileHopArgs(
  ctx: CompileCtx,
  hop: CallExpressionNode,
  fnAbi: AbiFunction,
): Promise<CompiledHop> {
  const liveIdx = hop.args.findIndex(
    (a) => a.type === NodeType.CallExpression || isBangHelperNode(a),
  );
  if (liveIdx === -1 && !hop.bang) {
    const argVals = await ctx.interpreters.interpretNodes(hop.args);
    return { kind: "plain", data: encodeCalldata(fnAbi, argVals) };
  }
  const specs = await compileArgSpecs(ctx, hop.args, fnAbi, hop.method);
  return { kind: "read", call: buildCallSegments(fnAbi, specs) };
}

/** Fold a read hop into a chain: the accumulated prefix becomes the
 *  read's target param and the chain restarts from the read value. */
function readParam(ctx: CompileCtx, chain: Chain, call: ReadCall): InputParam {
  const target = chainParam(ctx, chain);
  return staticCallParam(
    ctx.core,
    encodeRead(target, call.selector, call.segments),
  );
}

/** Compile a `::` call expression (possibly chained) into a Chain. */
export async function compileChain(
  ctx: CompileCtx,
  node: CallExpressionNode,
): Promise<Chain> {
  const { hops, rootTarget } = flattenCallNodes(node);

  let startAddress: Address | undefined;
  let start: InputParam;

  if (hops[0]?.bang) {
    // A leading `!::` hop reads from a computed head: the target may be
    // any operand (a bang helper, a variable, a literal), not just an
    // address chain. A live head is spliced as the read target word — the
    // core still requires it to resolve to a clean address word
    // (InvalidAddressWord otherwise); the win is computed heads like
    // `@bytes!($reg::packedPool() ">>" 96)!::{fee()(uint24)}`.
    const head = await compileOperand(ctx, rootTarget);
    if (head.kind === "const") {
      if (head.cat !== "Address") {
        throw new ErrorException(
          `a !:: read target must resolve to an address, got ${String(head.value)}`,
        );
      }
      startAddress = getAddress(head.value as string);
      start = rawParam(toWord(BigInt(startAddress)));
    } else {
      start = head.param;
    }
  } else {
    const rootValue = await ctx.interpreters.interpretNode(rootTarget);
    if (typeof rootValue !== "string" || !isAddress(rootValue)) {
      throw new ErrorException(
        `assertion target must resolve to an address, got ${rootValue}`,
      );
    }
    startAddress = getAddress(rootValue);
    start = rawParam(toWord(BigInt(startAddress)));
  }

  let calls: Hex[] = [];
  let lastAbi: AbiFunction | undefined;
  let liveArgs = false;

  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    const last = i === hops.length - 1;
    // The next hop's kind decides what THIS hop's value must be: a plain
    // `::` hop staticcalls it as an address; a `!::` hop splices it as the
    // read target word (any single-word value is acceptable — the core
    // enforces the clean address word on-chain).
    const nextBang = hops[i + 1]?.bang === true;
    if (hop.bang && !(hop.inputTypes && hop.outputTypes)) {
      throw new ErrorException(
        "a !:: hop requires the inline ABI form !::{method(argTypes)(returnTypes) args}",
      );
    }
    const fnAbi = await hopAbi(ctx, hop, {
      start,
      startAddress,
      calls,
      liveArgs,
    });
    if (!fnAbi.outputs || fnAbi.outputs.length === 0) {
      throw new ErrorException(
        `${hop.method} has no return value to assert on`,
      );
    }

    if (!last && hop.returnDestructure) {
      // A mid-chain lens: select the next hop's address from this hop's
      // return, wrapping the chain so far in pick (raw word) or nav
      // (typed navigation) and continuing from the wrapped expression.
      const hopPath = lensPath(hop.returnDestructure);
      const { terminal, resolved } = walkNavPath(
        fnAbi.outputs,
        hopPath,
        hop.method,
      );
      if (
        nextBang
          ? !SINGLE_WORD_ABI.test(terminal.type)
          : terminal.type !== "address"
      ) {
        throw new ErrorException(
          nextBang
            ? `a !:: read target must be a single-word value; the lens on ${hop.method} selects ${terminal.type.startsWith("tuple") ? "a struct" : terminal.type}`
            : `a chained call must continue on an address; the lens on ${hop.method} selects ${terminal.type.startsWith("tuple") ? "a struct" : terminal.type}`,
        );
      }
      const compiled = await compileHopArgs(ctx, hop, fnAbi);
      let prefix: InputParam;
      if (compiled.kind === "read") {
        prefix = readParam(
          ctx,
          { start, startAddress, calls, lastAbi: fnAbi },
          compiled.call,
        );
        liveArgs = true;
      } else {
        calls.push(compiled.data);
        prefix = chainParam(ctx, {
          start,
          startAddress,
          calls,
          lastAbi: fnAbi,
        });
      }
      const data = pickableIndex(fnAbi.outputs, resolved)
        ? encodePick(prefix, BigInt(resolved[0]))
        : encodeNav(
            prefix,
            formatReturnTuple(fnAbi.outputs),
            resolved.map(BigInt),
          );
      start = staticCallParam(ctx.core, data);
      startAddress = undefined;
      calls = [];
      lastAbi = fnAbi;
      continue;
    }
    if (!last) {
      if (nextBang) {
        if (
          fnAbi.outputs.length !== 1 ||
          !SINGLE_WORD_ABI.test(fnAbi.outputs[0].type)
        ) {
          throw new ErrorException(
            `a !:: read target must be a single-word value, or select one with a lens (e.g. ${hop.method}(...)[_ $ _]); ${hop.method} returns (${fnAbi.outputs.map((o) => o.type).join(", ")})`,
          );
        }
      } else if (
        fnAbi.outputs.length !== 1 ||
        fnAbi.outputs[0].type !== "address"
      ) {
        throw new ErrorException(
          `every chained call except the last must return a single address, or select one with a lens (e.g. ${hop.method}(...)[_ $ _]); ${hop.method} returns (${fnAbi.outputs.map((o) => o.type).join(", ")})`,
        );
      }
    }
    const compiled = await compileHopArgs(ctx, hop, fnAbi);
    if (compiled.kind === "read") {
      // The read value replaces the chain so far: it resolves this hop's
      // return, and (mid-chain) its first word is the next hop's target.
      start = readParam(
        ctx,
        { start, startAddress, calls, lastAbi: fnAbi },
        compiled.call,
      );
      startAddress = undefined;
      calls = [];
      liveArgs = true;
    } else {
      calls.push(compiled.data);
    }
    lastAbi = fnAbi;
  }

  return { start, startAddress, calls, lastAbi: lastAbi!, liveArgs };
}

/** Resolve a return-destructure lens into a navigation path: one index per
 *  nesting level. `[_ $ _]` = [1]; `[[_ $]]` = [0, 1] (element 1 of return
 *  value 0); `[[_ _ _ [_ $]]]` = [0, 3, 1]. Exactly one `$` overall.
 *  A `...` rest marker anchors the slots after it from the end, yielding
 *  negative indices: `[... $ _]` = [-2]; `[[... $]]` = [0, -1]. Fixed-arity
 *  levels resolve them to positive positions at build time; dynamic arrays
 *  keep them negative for on-chain from-the-end resolution. */
export function lensPath(slots: unknown[]): number[] {
  let path: number[] | undefined;
  const walk = (level: unknown[], prefix: number[]): void => {
    const restAt = level.indexOf("...");
    if (restAt !== -1 && level.indexOf("...", restAt + 1) !== -1) {
      throw new ErrorException(
        "an assertion lens can contain at most one ... per nesting level",
      );
    }
    for (let i = 0; i < level.length; i++) {
      const slot = level[i];
      if (slot === "...") continue;
      // Slots after a rest marker are end-anchored (negative index).
      const index = restAt !== -1 && i > restAt ? i - level.length : i;
      if (slot === "$") {
        if (path !== undefined) {
          throw new ErrorException(
            "an assertion lens must contain exactly one $ to select a value",
          );
        }
        path = [...prefix, index];
      } else if (Array.isArray(slot)) {
        walk(slot, [...prefix, index]);
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
 *  descriptor `nav`'s typed mode consumes, structs written as
 *  parenthesized tuples: "((address,uint256)[],address)". */
export function formatReturnTuple(outputs: readonly AbiParameter[]): string {
  return `(${outputs.map(formatParamType).join(",")})`;
}

export function formatParamType(p: AbiParameter): string {
  if (p.type.startsWith("tuple")) {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return `(${components.map(formatParamType).join(",")})${p.type.slice(5)}`;
  }
  return p.type;
}

/** Whether a single-level lens selection can compile to the cheaper raw
 *  `pick`: every output before the selection occupies exactly one head
 *  word (single-word static value, or the offset word of a dynamic value)
 *  and the selection itself is a single-word static value. */
function pickableIndex(
  outputs: readonly AbiParameter[],
  resolved: number[],
): boolean {
  if (resolved.length !== 1 || resolved[0] < 0) return false;
  const index = resolved[0];
  if (!SINGLE_WORD_ABI.test(outputs[index]?.type ?? "")) return false;
  for (let j = 0; j < index; j++) {
    const t = outputs[j].type;
    const singleHead =
      SINGLE_WORD_ABI.test(t) ||
      t === "string" ||
      t === "bytes" ||
      /\[\]$/.test(t);
    if (!singleHead) return false;
  }
  return true;
}

/** Walks the ABI type tree along a lens path, validating every step the
 *  core will take at execution time. Returns the terminal type and
 *  the resolved path: negative (end-anchored) indices are converted to
 *  positive positions wherever the arity is known at build time (tuples,
 *  fixed arrays, the top-level return values); dynamic arrays keep them
 *  negative for the core's on-chain from-the-end resolution. */
export function walkNavPath(
  outputs: readonly AbiParameter[],
  path: number[],
  method: string,
): { terminal: AbiParameter; resolved: number[] } {
  let current = { type: "tuple", components: outputs } as AbiParameter;
  const resolved: number[] = [];
  for (const index of path) {
    const suffix = current.type.match(ARRAY_SUFFIX);
    if (suffix) {
      if (suffix[1] === "") {
        // Dynamic array: length is unknown at build time; the core
        // resolves negative indices (and bounds-checks) on-chain.
        resolved.push(index);
      } else {
        const n = Number(suffix[1]);
        const pos = index < 0 ? n + index : index;
        if (pos < 0 || pos >= n) {
          throw new ErrorException(
            `index ${index} is out of range for the ${current.type} value in ${method}`,
          );
        }
        resolved.push(pos);
      }
      current = {
        ...current,
        type: current.type.slice(0, -suffix[0].length),
      } as AbiParameter;
    } else if (current.type === "tuple") {
      const components =
        (current as { components?: readonly AbiParameter[] }).components ?? [];
      const pos = index < 0 ? components.length + index : index;
      if (pos < 0 || pos >= components.length) {
        throw new ErrorException(
          `component index ${index} is out of range (${components.length} value(s)) in ${method}`,
        );
      }
      resolved.push(pos);
      current = components[pos];
    } else {
      throw new ErrorException(
        `cannot select into a ${current.type} value of ${method} — the lens indexes tuples (structs) and arrays`,
      );
    }
  }
  return { terminal: current, resolved };
}

/** Validate a dynamic lens terminal is something `nav` can return as a
 *  single envelope: string, bytes, or a dynamic array of single-word
 *  static elements. */
function checkNavigableDynamic(
  terminal: AbiParameter,
  method: string,
  context: string,
): void {
  const suffix = terminal.type.match(ARRAY_SUFFIX);
  const isDynArray = suffix?.[1] === "";
  if (!isDynArray && terminal.type !== "string" && terminal.type !== "bytes") {
    throw new ErrorException(
      `${context} must select a single value; the selection in ${method} is ${terminal.type.startsWith("tuple") ? "a struct" : terminal.type}`,
    );
  }
  if (isDynArray) {
    const element = {
      ...terminal,
      type: terminal.type.slice(0, -2),
    } as AbiParameter;
    if (isDynamicParam(element)) {
      throw new ErrorException(
        `${context} can select arrays of static elements only; ${terminal.type} elements are dynamic`,
      );
    }
  }
}

/**
 * Compile a call expression into the InputParam that resolves its value,
 * folding a destructure lens into `pick` (raw word, when the target word
 * position is static) or `nav` (typed navigation) around the chain. The
 * terminal is what the resolved bytes decode as: a single-word value, or a
 * dynamic value delivered as its canonical envelope.
 */
export async function compileCallValue(
  ctx: CompileCtx,
  node: CallExpressionNode,
): Promise<{ param: InputParam; terminal: AbiParameter }> {
  const chain = await compileChain(ctx, node);
  const outputs = chain.lastAbi.outputs!;
  const base = chainParam(ctx, chain);

  if (!node.returnDestructure) {
    if (outputs.length > 1) {
      throw new ErrorException(
        `${node.method} returns multiple values; use a destructure lens to select one, e.g. \`${node.method}(...)[_ $ _]\``,
      );
    }
    // A single return value: the raw returndata is already the value's
    // canonical encoding (word or envelope) — no selector needed.
    return { param: base, terminal: outputs[0] };
  }

  const path = lensPath(node.returnDestructure);
  const { terminal, resolved } = walkNavPath(outputs, path, node.method);
  if (SINGLE_WORD_ABI.test(terminal.type)) {
    const data = pickableIndex(outputs, resolved)
      ? encodePick(base, BigInt(resolved[0]))
      : encodeNav(base, formatReturnTuple(outputs), resolved.map(BigInt));
    return {
      param: staticCallParam(ctx.core, data),
      terminal,
    };
  }
  checkNavigableDynamic(terminal, node.method, "a value lens");
  return {
    param: staticCallParam(
      ctx.core,
      encodeNav(base, formatReturnTuple(outputs), resolved.map(BigInt)),
    ),
    terminal,
  };
}

// ---------------------------------------------------------------------------
//  Nested live call arguments
// ---------------------------------------------------------------------------

function wordTypesCompatible(declared: string, actual: string): boolean {
  return categoryFromAbiType(declared) === categoryFromAbiType(actual);
}

/** Compile a nested `::` call used as a call ARGUMENT into a live segment:
 *  single-word selections contribute a 32-byte word segment; dynamic
 *  selections (via `nav`) contribute their variable-size envelope. */
async function compileLiveCallArg(
  ctx: CompileCtx,
  node: CallExpressionNode,
  input: AbiParameter,
  method: string,
): Promise<ArgSpec> {
  const { param, terminal } = await compileCallValue(ctx, node);
  if (SINGLE_WORD_ABI.test(terminal.type)) {
    if (!wordTypesCompatible(input.type, terminal.type)) {
      throw new ErrorException(
        `the nested call ${node.method} resolves a ${terminal.type} value, but parameter ${input.name ?? ""} of ${method} is ${input.type}`,
      );
    }
    return { kind: "word", param };
  }
  if (formatParamType(terminal) !== formatParamType(input)) {
    throw new ErrorException(
      `the nested call ${node.method} resolves a ${formatParamType(terminal)} value, but parameter ${input.name ?? ""} of ${method} is ${formatParamType(input)} — adjust the lens to select a matching value`,
    );
  }
  return { kind: "dyn", param };
}

/** Compile a `!` helper used as a call ARGUMENT into a live word segment
 *  (folding to a constant when the helper does). */
async function compileLiveHelperArg(
  ctx: CompileCtx,
  node: HelperFunctionNode,
  input: AbiParameter,
  method: string,
): Promise<ArgSpec> {
  const o = await compileOnchainHelper(ctx, node);
  if (o.kind === "const") {
    return { kind: "value", value: o.value as never };
  }
  if (!SINGLE_WORD_ABI.test(input.type)) {
    throw new ErrorException(
      `@${node.name} resolves a single word; parameter ${input.name ?? ""} of ${method} is ${input.type}`,
    );
  }
  return { kind: "word", param: o.param };
}

// ---------------------------------------------------------------------------
//  Operand compilation (dispatch)
// ---------------------------------------------------------------------------

/** Compile a call expression used as a *nested* operand (inside an
 *  expression): the selection must land on a single word. */
async function compileCallOperand(
  ctx: CompileCtx,
  node: CallExpressionNode,
): Promise<Operand> {
  const { param, terminal } = await compileCallValue(ctx, node);
  const cat = categoryFromAbiType(terminal.type);
  if (node.returnDestructure && !isNumericCat(cat) && cat !== "Bool") {
    // Historical surface: nested lens selections feed the word machine.
    if (cat === "String" || cat === "Bytes") {
      throw new ErrorException(
        `a destructure lens inside an expression can only select single-word values, got ${terminal.type}`,
      );
    }
  }
  return { kind: "call", param, cat };
}

/** Compile a call expression used as a *top-level* assertion side. The
 *  lens (if any) is already folded into the param via pick/nav. */
export async function compileTopCall(
  ctx: CompileCtx,
  node: CallExpressionNode,
): Promise<Operand> {
  const { param, terminal } = await compileCallValue(ctx, node);
  return { kind: "call", param, cat: categoryFromAbiType(terminal.type) };
}

/** Property carrying a pre-compiled operand on a synthetic node: the
 *  fold-lambda machinery substitutes the element placeholder this way
 *  (see `onchain/lambda.ts`). {@link compileOperand} short-circuits on it
 *  before any node-type dispatch. */
export const PRECOMPILED_OPERAND = "__evmcrisprOperand";

/** A synthetic bareword node that compiles to a fixed operand. */
export function operandNode(operand: Operand): Node {
  return {
    type: NodeType.Bareword,
    value: "element",
    [PRECOMPILED_OPERAND]: operand,
  } as unknown as Node;
}

/** Compile any node into a nested-expression operand. */
export async function compileOperand(
  ctx: CompileCtx,
  node: Node,
): Promise<Operand> {
  const preCompiled = (node as unknown as Record<string, unknown>)[
    PRECOMPILED_OPERAND
  ];
  if (preCompiled) return preCompiled as Operand;
  if (node.type === NodeType.CallExpression) {
    return compileCallOperand(ctx, node as CallExpressionNode);
  }
  if (isBangHelperNode(node)) {
    return compileOnchainHelper(ctx, node);
  }
  const value = await ctx.interpreters.interpretNode(node);
  return constOperand(value);
}

/** Compile the argument of a chain-call slot (@balance!, @codehash!, …) — must
 *  be a `::` call expression or chain. */
export async function requireChainArg(
  ctx: CompileCtx,
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
 *  @hash!). Returns the raw chain param plus the lens selection (when
 *  present) so each helper can route through `nav` as it needs.
 *
 *  A nested `!` helper face resolving a string/bytes value is accepted
 *  too (e.g. @str.lower!(@token:symbol!(DAI))): its compiled operand
 *  passes through as a synthetic single-output result, so every dynamic
 *  face composes over faces the same way it composes over `::` calls. */
export async function chainArgWithLens(
  ctx: CompileCtx,
  helper: string,
  node: Node | undefined,
): Promise<{
  param: InputParam;
  outputs: readonly AbiParameter[];
  path?: number[];
  terminal?: AbiParameter;
}> {
  if (node && isBangHelperNode(node)) {
    const o = await compileOnchainHelper(ctx, node);
    if (o.kind !== "call" || (o.cat !== "String" && o.cat !== "Bytes")) {
      throw new ErrorException(
        `@${helper} nested helper argument must resolve a string/bytes value on-chain`,
      );
    }
    return {
      param: o.param,
      outputs: [{ type: o.cat === "String" ? "string" : "bytes" }],
    };
  }
  if (!node || node.type !== NodeType.CallExpression) {
    throw new ErrorException(
      `@${helper} expects a \`::\` call expression, e.g. @${helper}($target::method())`,
    );
  }
  const call = node as CallExpressionNode;
  const chain = await compileChain(ctx, call);
  const outputs = chain.lastAbi.outputs!;
  const param = chainParam(ctx, chain);
  if (!call.returnDestructure) return { param, outputs };

  const path = lensPath(call.returnDestructure);
  const { terminal, resolved } = walkNavPath(outputs, path, call.method);
  checkNavigableDynamic(terminal, call.method, `a lens inside @${helper}`);
  return { param, outputs, path: resolved, terminal };
}

/** Require a {@link chainArgWithLens} result to select a string or bytes
 *  value: the bytes operators (hash, byteLen, indexOf, slice, foldBytes)
 *  consume the value's DECODED payload, which only exists for a canonical
 *  string/bytes envelope. */
export function requireBytesLike(
  arg: {
    outputs: readonly AbiParameter[];
    path?: number[];
    terminal?: AbiParameter;
  },
  helper: string,
): void {
  const t = arg.path ? arg.terminal?.type : arg.outputs[0]?.type;
  if (arg.path === undefined && arg.outputs.length !== 1) {
    throw new ErrorException(
      `@${helper} needs a single string or bytes return value; select one with a lens`,
    );
  }
  if (t !== "string" && t !== "bytes") {
    throw new ErrorException(
      `@${helper} needs a string or bytes value, got ${t ?? "none"}`,
    );
  }
}

/** Wrap the selected value of a {@link chainArgWithLens} result in `nav`
 *  when a lens is present, so downstream data ops consume the selection's
 *  canonical envelope as if the call had returned it directly. */
export function lensedDataOperand(
  ctx: CompileCtx,
  arg: {
    param: InputParam;
    outputs: readonly AbiParameter[];
    path?: number[];
  },
): InputParam {
  if (!arg.path) return arg.param;
  return staticCallParam(
    ctx.core,
    encodeNav(arg.param, formatReturnTuple(arg.outputs), arg.path.map(BigInt)),
  );
}

/** Interpret a helper argument as a build-time integer constant
 *  (negative allowed — signed indices resolve on-chain). */
export async function constIntArg(
  ctx: CompileCtx,
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

/** The category an operand contributes to a composition check. Constants
 *  are coerced leniently (an address or bytes32 literal folds to its word
 *  via `constBigInt`), so only their signedness matters. */
function constLenientCat(o: Operand): Category {
  if (o.kind === "const") return o.cat === "Int" ? "Int" : "Uint";
  return o.cat;
}

/** Combine two numeric operands with an Operators arithmetic function,
 *  folding when both are build-time constants. Bool operands pass as their
 *  raw 0/1 words — no conversion call. Acceptance and result categories
 *  come from the composition table. */
export function arithCombine(
  ctx: CompileCtx,
  op: ArithOpName,
  l: Operand,
  r: Operand,
): Operand {
  // A live string operand coerces through parseUint: the resolved string
  // payload must be decimal ASCII (anything else reverts on-chain), so a
  // split version segment composes straight into arithmetic.
  const coerce = (o: Operand): Operand =>
    o.kind === "call" && o.cat === "String"
      ? { kind: "call", param: parseUintParamOf(ctx, o.param), cat: "Uint" }
      : o;
  l = coerce(l);
  r = coerce(r);
  for (const o of [l, r]) {
    if (o.kind === "call") {
      const reason = arithRejects(o.cat);
      if (reason) throw new ErrorException(reason);
    }
  }
  // Scale bookkeeping. Adding requires a common scale; multiplying and
  // dividing just accumulate one, so their operands are left as they are.
  let scale = resultScale(op, scaleOf(l), scaleOf(r));
  if (op === "Exp") {
    // An exponent counts repetitions, not units, so it never carries a
    // scale of its own.
    if (scaleOf(r)) {
      throw new ErrorException(
        "an exponent counts repetitions, so it cannot carry decimal places",
      );
    }
    // `x ^ n` over a SCALED base is fixed-point exponentiation: plain
    // integer exp would multiply the scale in too, leaving the word after
    // about four steps. The unit falls out of the scale itself.
    const base = scaleOf(l);
    if (base) {
      scale = base;
      const unit = 10n ** BigInt(base);
      if (l.kind === "const" && r.kind === "const") {
        return {
          kind: "const",
          cat: "Uint",
          value: Num.fromBigInt(rpow(constBigInt(l), constBigInt(r), unit)),
          scale,
        };
      }
      if (l.cat === "Int" || r.cat === "Int") {
        throw new ErrorException(
          "fixed-point exponentiation needs unsigned operands",
        );
      }
      return {
        kind: "call",
        param: opReadParam(ctx, OP_SELECTORS.rpow, [
          materializeWord(ctx, l),
          materializeWord(ctx, r),
          rawParam(toWord(unit)),
        ]),
        cat: "Uint",
        scale,
      };
    }
  } else if (op !== "Mul" && op !== "Div") {
    ({ l, r } = alignScales(ctx, l, r));
  } else if (op === "Div" && scale < 0) {
    throw new ErrorException(
      `dividing a value with ${scaleOf(l)} decimal places by one with ${scaleOf(r)} leaves a fraction — scale the numerator up first`,
    );
  }
  if (l.kind === "const" && r.kind === "const") {
    const value = foldArith(op, constBigInt(l), constBigInt(r));
    return {
      kind: "const",
      cat: value < 0n ? "Int" : "Uint",
      value: Num.fromBigInt(value),
      ...(scale ? { scale } : {}),
    };
  }
  const check = checkArith(op, constLenientCat(l), constLenientCat(r));
  if (!check.ok) throw new ErrorException(check.reason);
  const signed = l.cat === "Int" || r.cat === "Int";
  const scaled = <T extends Operand>(o: T): T =>
    scale ? ({ ...o, scale } as T) : o;
  // A fractional constant FACTOR has an exact on-chain form even though it
  // has no integer form of its own: scaling by 3/4 is one 512-bit mulDiv.
  // Must come before materializeWord, which has no integer to hand back.
  const fused = fuseRationalFactor(ctx, op, l, r, signed, check.result);
  if (fused) return scaled(fused);
  const lp = materializeWord(ctx, l);
  const rp = materializeWord(ctx, r);
  // mul-then-div fuses into one 512-bit mulDiv read, so a * b / c never
  // reverts on an intermediate past 2^256 (unsigned only: there is no
  // signed mulDiv on-chain).
  if (op === "Div" && !signed && l.kind === "call" && l.mulOf) {
    return scaled({
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.mulDiv, [l.mulOf.a, l.mulOf.b, rp]),
      cat: check.result,
    });
  }
  return scaled({
    kind: "call",
    param: wordOpParam(ctx, ARITH_FN[op], signed, lp, rp),
    cat: check.result,
    ...(op === "Mul" && !signed ? { mulOf: { a: lp, b: rp } } : {}),
  });
}

/** Decimal places the operand's word carries; absent means a plain
 *  integer. */
export function scaleOf(o: Operand): number {
  return o.scale ?? 0;
}

/**
 * Restate an operand at a higher scale. A constant absorbs the factor into
 * its own exact rational — which is the whole point, since `0.05` at scale
 * 27 becomes the integer 5e25 and needs no rounding — while a live value
 * has to multiply on-chain.
 */
function rescaleTo(ctx: CompileCtx, o: Operand, target: number): Operand {
  const delta = target - scaleOf(o);
  if (delta === 0) return o;
  const factor = 10n ** BigInt(delta);
  if (o.kind === "const") {
    if (!(o.value instanceof Num)) return { ...o, scale: target };
    return { ...o, value: o.value.mul(Num(factor)), scale: target };
  }
  return {
    kind: "call",
    param: wordOpParam(
      ctx,
      "mul",
      o.cat === "Int",
      o.param,
      rawParam(toWord(factor)),
    ),
    cat: o.cat,
    scale: target,
  };
}

/**
 * Bring both operands to a common scale so their words are comparable and
 * addable. Rescaling UP only — scaling down would divide away precision
 * the caller never agreed to lose.
 */
function alignScales(
  ctx: CompileCtx,
  l: Operand,
  r: Operand,
): { l: Operand; r: Operand; scale: number } {
  const scale = Math.max(scaleOf(l), scaleOf(r));
  return { l: rescaleTo(ctx, l, scale), r: rescaleTo(ctx, r, scale), scale };
}

/** Scale of an arithmetic result: multiplying adds decimal places and
 *  dividing removes them, while the additive family needs both sides at
 *  one scale and keeps it. */
function resultScale(op: ArithOpName, l: number, r: number): number {
  if (op === "Mul") return l + r;
  if (op === "Div") return l - r;
  return Math.max(l, r);
}

/** The positive rational behind a fractional constant operand, if that is
 *  what this operand is. Integers are left alone — plain mul/div is
 *  cheaper than a mulDiv — and negatives bail to the signed path, which
 *  has no mulDiv to fuse into. */
function positiveFraction(
  o: Operand,
): { num: bigint; den: bigint } | undefined {
  if (o.kind !== "const" || !(o.value instanceof Num)) return undefined;
  const v = o.value;
  if (v.isInteger() || v.num <= 0n) return undefined;
  return { num: v.num, den: v.den };
}

/**
 * Scaling by a rational is exact on-chain: `x * 3/4` is `mulDiv(x, 3, 4)`
 * and `x / (3/4)` is `mulDiv(x, 4, 3)`, both through the 512-bit
 * intermediate so the product never has to fit a word. Without this a rate
 * literal or a percentage would have to be pre-scaled by hand, since the
 * factor itself is not an integer.
 */
function fuseRationalFactor(
  ctx: CompileCtx,
  op: ArithOpName,
  l: Operand,
  r: Operand,
  signed: boolean,
  cat: Category,
): Operand | undefined {
  if (signed || (op !== "Mul" && op !== "Div")) return undefined;
  // The live side stays the multiplicand; a constant denominator or
  // numerator becomes the other two mulDiv slots.
  const live = l.kind === "call" ? l : op === "Mul" ? r : undefined;
  if (live?.kind !== "call") return undefined;
  const factor = positiveFraction(live === l ? r : l);
  if (!factor) return undefined;
  const [a, b] =
    op === "Mul" ? [factor.num, factor.den] : [factor.den, factor.num];
  return {
    kind: "call",
    param: opReadParam(ctx, OP_SELECTORS.mulDiv, [
      live.param,
      rawParam(toWord(a)),
      rawParam(toWord(b)),
    ]),
    cat,
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

/** keccak256 of a string value's raw UTF-8 payload bytes — what `hash`
 *  computes over a spliced live string return (the digest covers the
 *  decoded payload, not the ABI envelope). */
export function stringDigest(value: string): Hex {
  return keccak256(stringToHex(value));
}

/** Combine two operands with an Operators comparison (nested use).
 *  Acceptance comes from the composition table; a `Bytes`-categorized
 *  constant (a short hex literal) keeps its historical numeric coercion. */
export function cmpCombine(
  ctx: CompileCtx,
  op: CmpOpName,
  l: Operand,
  r: Operand,
): Operand {
  const cmpCat = (o: Operand): Category =>
    o.kind === "const" && o.cat === "Bytes" ? "Uint" : o.cat;
  const check = checkCmp(op, cmpCat(l), cmpCat(r));
  if (!check.ok) throw new ErrorException(check.reason);

  // Bool vs const bool: fold into the operand itself or its negation.
  if (l.cat === "Bool" || r.cat === "Bool") {
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
      param: wordOpParam(ctx, CMP_FN[op], false, lp, rp),
      cat: "Bool",
    };
  }

  // Strings inside an expression: the word machine can't carry dynamic
  // values, so == / != compile to a keccak comparison — each live side is
  // spliced into `hash` (keccak of the decoded string payload) and
  // constants fold to the digest of their own UTF-8 bytes at build time.
  // Ordering comparisons stay invalid.
  if (l.cat === "String" || r.cat === "String") {
    if (l.kind === "const" && r.kind === "const") {
      return {
        kind: "const",
        cat: "Bool",
        value: (l.value === r.value) === (op === "Eq"),
      };
    }
    const hashParam = (o: Operand): InputParam =>
      o.kind === "call"
        ? hashParamOf(ctx, o.param)
        : rawParam(stringDigest(o.value as string));
    const lp = hashParam(l);
    const rp = hashParam(r);
    return {
      kind: "call",
      param: wordOpParam(ctx, CMP_FN[op], false, lp, rp),
      cat: "Bool",
    };
  }
  // Two words only mean the same thing at the same scale: comparing a ray
  // rate against the literal 0.05 works because aligning turns the literal
  // into 5e25, not because the words happen to line up.
  ({ l, r } = alignScales(ctx, l, r));
  if (l.kind === "const" && r.kind === "const") {
    return {
      kind: "const",
      cat: "Bool",
      value: foldCmp(op, constBigInt(l), constBigInt(r)),
    };
  }
  const signed = l.cat === "Int" || r.cat === "Int";
  const lp = materializeWord(ctx, l);
  const rp = materializeWord(ctx, r);
  return {
    kind: "call",
    param: wordOpParam(ctx, CMP_FN[op], signed, lp, rp),
    cat: "Bool",
  };
}

/** Boolean negation: fold consts, wrap calls in `eq(inner, 0)`. */
export function notCombine(ctx: CompileCtx, o: Operand): Operand {
  if (o.kind === "const") {
    if (o.cat !== "Bool")
      throw new ErrorException("`not` needs a boolean operand");
    return { kind: "const", cat: "Bool", value: o.value !== true };
  }
  const inner = materializeBool(ctx, o);
  return {
    kind: "call",
    param: wordOpParam(ctx, "eq", false, inner, rawParam(toWord(0n))),
    cat: "Bool",
    notOf: inner,
  };
}

function logicCombine(
  ctx: CompileCtx,
  op: LogicOpName,
  l: Operand,
  r: Operand,
): Operand {
  const check = checkLogic(op, l.cat, r.cat);
  if (!check.ok) throw new ErrorException(check.reason);

  // Numeric xor is bitwise (the table reports a numeric result).
  if (check.result !== "Bool") {
    if (l.kind === "const" && r.kind === "const") {
      const value = constBigInt(l) ^ constBigInt(r);
      return { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
    }
    const lp = materializeWord(ctx, l);
    const rp = materializeWord(ctx, r);
    return {
      kind: "call",
      param: wordOpParam(ctx, "bitXor", false, lp, rp),
      cat: "Uint",
    };
  }

  const lb = l;
  const rb = r;

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

  // On clean 0/1 bool words the bitwise operators coincide with logical
  // ones.
  const lp = materializeBool(ctx, lb);
  const rp = materializeBool(ctx, rb);
  return {
    kind: "call",
    param: wordOpParam(ctx, LOGIC_FN[op], false, lp, rp),
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
  ctx: CompileCtx,
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
  ctx: CompileCtx,
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
  ctx: CompileCtx,
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
  ctx: CompileCtx,
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

/** Wrap core-primitive calldata (read/pick/nav/chain) as a call operand on
 *  the core contract. */
export function coreCall(ctx: CompileCtx, data: Hex, cat: Category): Operand {
  return {
    kind: "call",
    param: staticCallParam(ctx.core, data),
    cat,
  };
}

/** Wrap plain Operators calldata (all arguments fixed at composition time)
 *  as a call operand pointed straight at the Operators contract. */
export function opsCall(ctx: CompileCtx, data: Hex, cat: Category): Operand {
  return {
    kind: "call",
    param: staticCallParam(ctx.operators, data),
    cat,
  };
}

/** Compile `@len!`-style length access: a nav path ending in the LEN
 *  sentinel returns the decoded length of the navigated dynamic value. */
export function lenParam(
  ctx: CompileCtx,
  param: InputParam,
  outputs: readonly AbiParameter[],
  path: readonly number[],
): InputParam {
  return staticCallParam(
    ctx.core,
    encodeNav(param, formatReturnTuple(outputs), [
      ...path.map(BigInt),
      LEN_STEP,
    ]),
  );
}

/** Compile the (possibly array-wrapped) operand list of a variadic helper
 *  (@min!, @max!, @absdiff!). */
export async function variadicOperands(
  ctx: CompileCtx,
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

// ---------------------------------------------------------------------------
//  ABI loading
// ---------------------------------------------------------------------------

/** Load the ABI function fragment for `method` on `target`. */
export async function loadFunctionAbi(
  module: Module,
  target: Address,
  method: string,
): Promise<AbiFunction> {
  const chainId = await module.getChainId();
  let abi = module.bindingsManager.getBindingValue(
    abiBindingKey(chainId, target),
    BindingsSpace.ABI,
  ) as Abi | undefined;

  if (!abi) {
    const client = await module.getClient();
    const [, fetched] = await fetchAbi(target, client);
    abi = fetched;
  }

  const item = getAbiItem({ abi, name: method }) as AbiFunction | undefined;
  if (item?.type !== "function") {
    throw new ErrorException(
      `function "${method}" not found in ABI of ${target}`,
    );
  }
  return item;
}
