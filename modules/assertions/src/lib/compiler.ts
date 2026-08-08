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
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  parseAbiItem,
} from "viem";
import { loadFunctionAbi } from "./assertions";
import type { CalcOpName } from "./combinators";
import {
  encodeCalc,
  encodeChain,
  encodeData,
  encodeNav,
  encodePick,
  encodeUnary,
  LEN_STEP,
} from "./combinators";
import type {
  ArithOpName,
  Category,
  CmpOpName,
  LogicOpName,
} from "./composition";
import {
  ARITH_SYMBOL,
  arithRejects,
  CMP_SYMBOL,
  checkArith,
  checkCmp,
  checkLogic,
  isNumericCat,
} from "./composition";
import type { ArgSpec, HoleRegistry } from "./construct";
import { buildCalldata, dynHole, isDynamicParam, wordHole } from "./construct";
import type { InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

/** Re-exported from the composition table (the single source of truth for
 *  categories and operator acceptance — see ./composition). */
export type { ArithOpName, Category, CmpOpName } from "./composition";

/** Re-exported from the construct layer (shared ABI shape rules). */
export { isDynamicParam } from "./construct";

/** Signed calc variants, where checked semantics differ from unsigned. */
const SIGNED_CALC: Partial<Record<string, CalcOpName>> = {
  Add: "SAdd",
  Sub: "SSub",
  Mul: "SMul",
  Div: "SDiv",
  Mod: "SMod",
  Min: "SMin",
  Max: "SMax",
  AbsDiff: "SAbsDiff",
  Lt: "SLt",
  Gt: "SGt",
  Le: "SLe",
  Ge: "SGe",
};

export function calcOpFor(
  op: ArithOpName | CmpOpName,
  signed: boolean,
): CalcOpName {
  if (!signed) return op as CalcOpName;
  return SIGNED_CALC[op] ?? (op as CalcOpName);
}

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
 * A compiled expression operand: either a value known at build time, or an
 * ERC-8211 `InputParam` resolved on-chain at assertion time (a staticcall,
 * balance read, or nested combinator expression).
 */
export type Operand =
  | { kind: "const"; cat: Category; value: Num | boolean | string }
  | {
      kind: "call";
      param: InputParam;
      cat: Category;
      /** When this param is `unary(IsZero, inner)`, the inner param — lets
       *  the top level judge `inner EQ 0` instead of `isZero(inner) EQ 1`. */
      notOf?: InputParam;
    };

export interface CompilerCtx {
  module: Module;
  interpreters: NodesInterpreters;
  /** Resolved combinators contract address. */
  combinators: Address;
  /** Live-argument hole registry for this compilation (see ./construct). */
  holes: HoleRegistry;
}

/** A flattened `::` chain as the v2 combinators consume it: `start`
 *  resolves to the first hop's target, `calls[i]` runs on the previous
 *  hop's first return word. */
export interface Chain {
  /** InputParam resolving to the first hop's target address. */
  start: InputParam;
  /** Set when `start` is a literal address (single-hop shortcut + ABI
   *  fetching for named hops). */
  startAddress?: Address;
  /** Plain abi.encodeCall entries, one per hop (may carry hole markers). */
  calls: Hex[];
  lastAbi: AbiFunction;
}

/** Express a chain as a single InputParam: a one-hop chain rooted at a
 *  literal address is the call itself; anything longer routes through the
 *  `chain` combinator. */
export function chainParam(ctx: CompilerCtx, chain: Chain): InputParam {
  if (chain.calls.length === 1 && chain.startAddress) {
    return staticCallParam(chain.startAddress, chain.calls[0]);
  }
  return staticCallParam(
    ctx.combinators,
    encodeChain(chain.start, chain.calls),
  );
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

export function constBigInt(o: Operand & { kind: "const" }): bigint {
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

/** Materialize an operand as an InputParam for a combinator slot reading a
 *  raw 32-byte word. Live params pass through untouched — bool returns are
 *  0/1 words and signed returns are two's-complement words, so no
 *  conversion is ever needed; constants become RAW_BYTES literal words
 *  with negative values encoded as their two's-complement word. */
export function materializeWord(_ctx: CompilerCtx, o: Operand): InputParam {
  if (o.kind === "call") return o.param;
  return rawParam(toWord(constBigInt(o)));
}

/** Materialize an operand as a bool-word InputParam. */
function materializeBool(_ctx: CompilerCtx, o: Operand): InputParam {
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

function callsHaveHoles(ctx: CompilerCtx, calls: Hex[]): boolean {
  const markers = [
    ...ctx.holes.words.keys(),
    ...(ctx.holes.dyn ? [ctx.holes.dyn.marker] : []),
  ];
  return calls.some((c) => {
    const body = c.slice(2).toLowerCase();
    return markers.some((m) => body.includes(m));
  });
}

/** Resolve the address a chain prefix returns, via a build-time eth_call.
 *  Only needed to fetch the ABI of a named (non-inline) later hop. */
async function resolveChainAddress(
  ctx: CompilerCtx,
  start: InputParam,
  startAddress: Address | undefined,
  calls: Hex[],
): Promise<Address> {
  if (callsHaveHoles(ctx, calls)) {
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
  ctx: CompilerCtx,
  hop: CallExpressionNode,
  chain: Pick<Chain, "start" | "startAddress" | "calls">,
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
        );
  return loadFunctionAbi(ctx.module, addr, hop.method);
}

/** Compile a hop's argument list, turning nested `::` calls and `!` helpers
 *  into live holes (word or dynamic-envelope splices) and interpreting
 *  everything else at build time. */
async function compileHopArgs(
  ctx: CompilerCtx,
  hop: CallExpressionNode,
  fnAbi: AbiFunction,
): Promise<Hex> {
  const liveIdx = hop.args.findIndex(
    (a) => a.type === NodeType.CallExpression || isBangHelperNode(a),
  );
  if (liveIdx === -1) {
    const argVals = await ctx.interpreters.interpretNodes(hop.args);
    return encodeCalldata(fnAbi, argVals);
  }
  if (hop.args.length !== fnAbi.inputs.length) {
    throw new ErrorException(
      `${hop.method} expects ${fnAbi.inputs.length} argument(s), got ${hop.args.length}`,
    );
  }
  const specs: ArgSpec[] = [];
  for (let i = 0; i < hop.args.length; i++) {
    const arg = hop.args[i];
    const input = fnAbi.inputs[i];
    if (arg.type === NodeType.CallExpression) {
      specs.push(
        await compileLiveCallArg(
          ctx,
          arg as CallExpressionNode,
          input,
          hop.method,
        ),
      );
    } else if (isBangHelperNode(arg)) {
      specs.push(await compileLiveHelperArg(ctx, arg, input, hop.method));
    } else {
      specs.push({
        kind: "value",
        value: (await ctx.interpreters.interpretNode(arg)) as never,
      });
    }
  }
  return buildCalldata(fnAbi, specs);
}

/** Compile a `::` call expression (possibly chained) into a Chain. */
export async function compileChain(
  ctx: CompilerCtx,
  node: CallExpressionNode,
): Promise<Chain> {
  const { hops, rootTarget } = flattenCallNodes(node);

  const rootValue = await ctx.interpreters.interpretNode(rootTarget);
  if (typeof rootValue !== "string" || !isAddress(rootValue)) {
    throw new ErrorException(
      `assertion target must resolve to an address, got ${rootValue}`,
    );
  }

  let startAddress: Address | undefined = getAddress(rootValue);
  let start: InputParam = rawParam(toWord(BigInt(startAddress)));
  let calls: Hex[] = [];
  let lastAbi: AbiFunction | undefined;

  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    const last = i === hops.length - 1;
    const fnAbi = await hopAbi(ctx, hop, { start, startAddress, calls });
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
      if (terminal.type !== "address") {
        throw new ErrorException(
          `a chained call must continue on an address; the lens on ${hop.method} selects ${terminal.type.startsWith("tuple") ? "a struct" : terminal.type}`,
        );
      }
      calls.push(await compileHopArgs(ctx, hop, fnAbi));
      const prefix = chainParam(ctx, {
        start,
        startAddress,
        calls,
        lastAbi: fnAbi,
      });
      const data = pickableIndex(fnAbi.outputs, resolved)
        ? encodePick(prefix, BigInt(resolved[0]))
        : encodeNav(
            prefix,
            formatReturnTuple(fnAbi.outputs),
            resolved.map(BigInt),
          );
      start = staticCallParam(ctx.combinators, data);
      startAddress = undefined;
      calls = [];
      lastAbi = fnAbi;
      continue;
    }
    if (!last) {
      if (fnAbi.outputs.length !== 1 || fnAbi.outputs[0].type !== "address") {
        throw new ErrorException(
          `every chained call except the last must return a single address, or select one with a lens (e.g. ${hop.method}(...)[_ $ _]); ${hop.method} returns (${fnAbi.outputs.map((o) => o.type).join(", ")})`,
        );
      }
    }
    calls.push(await compileHopArgs(ctx, hop, fnAbi));
    lastAbi = fnAbi;
  }

  return { start, startAddress, calls, lastAbi: lastAbi! };
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
 *  combinator will take at execution time. Returns the terminal type and
 *  the resolved path: negative (end-anchored) indices are converted to
 *  positive positions wherever the arity is known at build time (tuples,
 *  fixed arrays, the top-level return values); dynamic arrays keep them
 *  negative for the combinator's on-chain from-the-end resolution. */
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
        // Dynamic array: length is unknown at build time; the combinator
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
  ctx: CompilerCtx,
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
      param: staticCallParam(ctx.combinators, data),
      terminal,
    };
  }
  checkNavigableDynamic(terminal, node.method, "a value lens");
  return {
    param: staticCallParam(
      ctx.combinators,
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

/** Compile a nested `::` call used as a call ARGUMENT into a live hole:
 *  single-word selections splice as 32-byte word holes; dynamic selections
 *  (via `nav`) splice as a variable-size envelope hole. */
async function compileLiveCallArg(
  ctx: CompilerCtx,
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
    return { kind: "word", marker: wordHole(ctx.holes, param) };
  }
  if (formatParamType(terminal) !== formatParamType(input)) {
    throw new ErrorException(
      `the nested call ${node.method} resolves a ${formatParamType(terminal)} value, but parameter ${input.name ?? ""} of ${method} is ${formatParamType(input)} — adjust the lens to select a matching value`,
    );
  }
  return { kind: "dyn", marker: dynHole(ctx.holes, param) };
}

/** Compile a `!` helper used as a call ARGUMENT into a live word hole
 *  (folding to a constant when the helper does). */
async function compileLiveHelperArg(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
  input: AbiParameter,
  method: string,
): Promise<ArgSpec> {
  const o = await compileBangHelper(ctx, node);
  if (o.kind === "const") {
    return { kind: "value", value: o.value as never };
  }
  if (!SINGLE_WORD_ABI.test(input.type)) {
    throw new ErrorException(
      `@${node.name} resolves a single word; parameter ${input.name ?? ""} of ${method} is ${input.type}`,
    );
  }
  return { kind: "word", marker: wordHole(ctx.holes, o.param) };
}

// ---------------------------------------------------------------------------
//  Operand compilation (dispatch)
// ---------------------------------------------------------------------------

/** Compile a call expression used as a *nested* operand (inside an
 *  expression): the selection must land on a single word. */
async function compileCallOperand(
  ctx: CompilerCtx,
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
  ctx: CompilerCtx,
  node: CallExpressionNode,
): Promise<Operand> {
  const { param, terminal } = await compileCallValue(ctx, node);
  return { kind: "call", param, cat: categoryFromAbiType(terminal.type) };
}

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

/** Compile the argument of a chain-call slot (@balance!, @codehash!, …) — must
 *  be a `::` call expression or chain. */
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
 *  @hash!). Returns the raw chain param plus the lens selection (when
 *  present) so each helper can route through `nav` as it needs. */
export async function chainArgWithLens(
  ctx: CompilerCtx,
  helper: string,
  node: Node | undefined,
): Promise<{
  param: InputParam;
  outputs: readonly AbiParameter[];
  path?: number[];
  terminal?: AbiParameter;
}> {
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

/** Wrap the selected value of a {@link chainArgWithLens} result in `nav`
 *  when a lens is present, so downstream data ops consume the selection's
 *  canonical envelope as if the call had returned it directly. */
export function lensedDataOperand(
  ctx: CompilerCtx,
  arg: {
    param: InputParam;
    outputs: readonly AbiParameter[];
    path?: number[];
  },
): InputParam {
  if (!arg.path) return arg.param;
  return staticCallParam(
    ctx.combinators,
    encodeNav(arg.param, formatReturnTuple(arg.outputs), arg.path.map(BigInt)),
  );
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

/** The category an operand contributes to a composition check. Constants
 *  are coerced leniently (an address or bytes32 literal folds to its word
 *  via `constBigInt`), so only their signedness matters. */
function constLenientCat(o: Operand): Category {
  if (o.kind === "const") return o.cat === "Int" ? "Int" : "Uint";
  return o.cat;
}

/** Combine two numeric operands with a `calc` arithmetic opcode, folding
 *  when both are build-time constants. Bool operands pass as their raw 0/1
 *  words — no conversion call. Acceptance and result categories come from
 *  the composition table. */
export function arithCombine(
  ctx: CompilerCtx,
  op: ArithOpName,
  l: Operand,
  r: Operand,
): Operand {
  for (const o of [l, r]) {
    if (o.kind === "call") {
      const reason = arithRejects(o.cat);
      if (reason) throw new ErrorException(reason);
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
  const check = checkArith(op, constLenientCat(l), constLenientCat(r));
  if (!check.ok) throw new ErrorException(check.reason);
  const signed = l.cat === "Int" || r.cat === "Int";
  const lp = materializeWord(ctx, l);
  const rp = materializeWord(ctx, r);
  return {
    kind: "call",
    param: staticCallParam(
      ctx.combinators,
      encodeCalc(calcOpFor(op, signed), lp, rp),
    ),
    cat: check.result,
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

/** keccak256 of a value's canonical string envelope — what `data(Hash)`
 *  computes over a live string return. */
export function stringEnvelopeDigest(value: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "string" }], [value]));
}

/** Combine two operands with a `calc` comparison opcode (nested use).
 *  Acceptance comes from the composition table; a `Bytes`-categorized
 *  constant (a short hex literal) keeps its historical numeric coercion. */
export function cmpCombine(
  ctx: CompilerCtx,
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
      param: staticCallParam(ctx.combinators, encodeCalc(op, lp, rp)),
      cat: "Bool",
    };
  }

  // Strings inside an expression: the word machine can't carry dynamic
  // values, so == / != compile to a keccak comparison — each live side is
  // wrapped in data(Hash) (keccak of its raw returndata, i.e. the ABI
  // string envelope) and constants fold to the digest of their own
  // envelope at build time. Ordering comparisons stay invalid.
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
        ? staticCallParam(ctx.combinators, encodeData("Hash", o.param))
        : rawParam(stringEnvelopeDigest(o.value as string));
    const lp = hashParam(l);
    const rp = hashParam(r);
    return {
      kind: "call",
      param: staticCallParam(ctx.combinators, encodeCalc(op, lp, rp)),
      cat: "Bool",
    };
  }
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
    param: staticCallParam(
      ctx.combinators,
      encodeCalc(calcOpFor(op, signed), lp, rp),
    ),
    cat: "Bool",
  };
}

/** Boolean negation: fold consts, wrap calls in `unary(IsZero)`. */
export function notCombine(ctx: CompilerCtx, o: Operand): Operand {
  if (o.kind === "const") {
    if (o.cat !== "Bool")
      throw new ErrorException("`not` needs a boolean operand");
    return { kind: "const", cat: "Bool", value: o.value !== true };
  }
  const inner = materializeBool(ctx, o);
  return {
    kind: "call",
    param: staticCallParam(ctx.combinators, encodeUnary("IsZero", inner)),
    cat: "Bool",
    notOf: inner,
  };
}

function logicCombine(
  ctx: CompilerCtx,
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
      param: staticCallParam(ctx.combinators, encodeCalc("Xor", lp, rp)),
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

  // On clean 0/1 bool words the bitwise opcodes coincide with logical ones.
  const lp = materializeBool(ctx, lb);
  const rp = materializeBool(ctx, rb);
  const calcOp: CalcOpName = op === "and" ? "And" : op === "or" ? "Or" : "Xor";
  return {
    kind: "call",
    param: staticCallParam(ctx.combinators, encodeCalc(calcOp, lp, rp)),
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
  return {
    kind: "call",
    param: staticCallParam(ctx.combinators, data),
    cat,
  };
}

/** Compile `@len!`-style length access: a nav path ending in the LEN
 *  sentinel returns the decoded length of the navigated dynamic value. */
export function lenParam(
  ctx: CompilerCtx,
  param: InputParam,
  outputs: readonly AbiParameter[],
  path: readonly number[],
): InputParam {
  return staticCallParam(
    ctx.combinators,
    encodeNav(param, formatReturnTuple(outputs), [
      ...path.map(BigInt),
      LEN_STEP,
    ]),
  );
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
