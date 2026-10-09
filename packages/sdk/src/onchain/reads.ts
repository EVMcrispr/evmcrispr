/**
 * P1 read-face plumbing: compile a known-ABI single read into an operand.
 * With a target fixed at composition time and literal arguments it is
 * plain calldata (a direct staticcall); a live target or live arguments
 * (`::!` calls or on-chain helpers) fold the call into a core `read` or
 * `get`, made against whatever the target resolves to when the assertion
 * runs. Arguments arrive as AST nodes or as pre-resolved `{ value }`
 * defaults.
 */
import type { AbiFunction, Address, Hex } from "viem";
import { getAddress } from "viem";
import { ErrorException } from "../errors";
import type { Node } from "../types";
import { NodeType } from "../types";
import { encodeCalldata } from "../utils/encoders";
import {
  compileOperand,
  materializeWord,
  PRECOMPILED_OPERAND,
} from "./compile";
import type { ArgSpec } from "./construct";
import { buildCall, callParam } from "./construct";
import { encodePick, encodeRead } from "./core";
import type { InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";
import type { Category, CompileCtx, Operand } from "./types";

/** The contract a read face reads: an address fixed at composition time,
 *  or a parameter resolving to one when the assertion runs. */
export type ReadTarget = Address | InputParam;

const isLiveNode = (node: Node): boolean =>
  node.type === NodeType.CallExpression ||
  (node.type === NodeType.HelperFunctionExpression &&
    !!(node as { name?: string }).name?.endsWith("!")) ||
  PRECOMPILED_OPERAND in (node as unknown as Record<string, unknown>);

/**
 * The target of a read face from its argument node. A `::!` call or an
 * on-chain helper that yields an address is a live target; anything else
 * is interpreted at composition time and passed through `resolve` (a
 * symbol lookup, a default), or read as an address.
 */
export async function readTarget(
  ctx: CompileCtx,
  helper: string,
  node: Node,
  resolve?: (value: unknown) => Address | Promise<Address>,
): Promise<ReadTarget> {
  if (isLiveNode(node)) {
    const o = await compileOperand(ctx, node);
    if (o.kind !== "const") {
      if (o.cat !== "Address") {
        throw new ErrorException(
          `@${helper} reads a contract: its live target must resolve to an address, got a ${o.cat} value`,
        );
      }
      return materializeWord(ctx, o);
    }
    return resolve ? resolve(o.value) : getAddress(String(o.value));
  }
  const value = await ctx.interpreters.interpretNode(node);
  return resolve ? resolve(value) : getAddress(String(value));
}

/** Whether a read-face argument is resolved when the assertion runs (a
 *  `::!` call or an on-chain helper) and not when the script is built. */
export const isLiveArg = (node: Node | undefined): boolean =>
  node !== undefined && isLiveNode(node);

/**
 * `target.<data>` as a parameter, for complete calldata built at
 * composition time: a direct staticcall to a fixed target, or a core
 * `read` (the selector, then the rest of the calldata as one literal
 * segment) against a live one.
 */
export function targetCallParam(
  ctx: CompileCtx,
  target: ReadTarget,
  data: Hex,
): InputParam {
  if (typeof target === "string") return staticCallParam(target, data);
  const rest = `0x${data.slice(10)}` as Hex;
  return staticCallParam(
    ctx.core,
    encodeRead(
      target,
      data.slice(0, 10) as Hex,
      rest === "0x" ? [] : [rawParam(rest)],
    ),
  );
}

/** A read-face argument: an AST node, or a pre-resolved default value. */
export type ReadArg = Node | { value: unknown };

const isValueArg = (a: ReadArg): a is { value: unknown } =>
  typeof (a as { type?: unknown }).type !== "string";

async function argSpec(
  ctx: CompileCtx,
  arg: ReadArg,
  fn: string,
): Promise<ArgSpec> {
  if (isValueArg(arg)) {
    return { kind: "value", value: arg.value as never };
  }
  const node = arg;
  // An operand a caller already compiled (operandNode) is a value like any
  // other; without this it would fall through to the interpreter, which
  // sees only the synthetic bareword.
  if (isLiveNode(node)) {
    const o = await compileOperand(ctx, node);
    if (o.kind === "const") {
      return { kind: "value", value: o.value as never };
    }
    if (o.cat === "String" || o.cat === "Bytes") {
      throw new ErrorException(
        `a live argument of ${fn} must resolve a single word, got a ${o.cat} value`,
      );
    }
    return { kind: "word", param: materializeWord(ctx, o) };
  }
  return {
    kind: "value",
    value: (await ctx.interpreters.interpretNode(node)) as never,
  };
}

/**
 * Compile `target.fn(args)` into an operand: plain calldata when every
 * argument is a build-time value, a core `read`/`get` when any is live.
 * `pickWord` unwraps one word of a multi-value return through a core
 * `pick` (the same service `directReadOperand` provides for build-time
 * calldata), so the operand stays a single word wherever it
 * nests — a single constraint only inspects the first word, but a nested splice
 * would otherwise carry the whole returndata.
 */
export async function callReadOperand(
  ctx: CompileCtx,
  target: ReadTarget,
  fnAbi: AbiFunction,
  args: readonly ReadArg[],
  cat: Category,
  pickWord?: bigint,
): Promise<Operand> {
  if (args.length !== fnAbi.inputs.length) {
    throw new ErrorException(
      `${fnAbi.name} expects ${fnAbi.inputs.length} argument(s), got ${args.length}`,
    );
  }
  const specs: ArgSpec[] = [];
  for (const arg of args) {
    specs.push(await argSpec(ctx, arg, fnAbi.name));
  }
  let param: InputParam;
  if (typeof target === "string" && specs.every((s) => s.kind === "value")) {
    const values = specs.map((s) => (s as { value: unknown }).value);
    param = staticCallParam(target, encodeCalldata(fnAbi, values as never));
  } else {
    param = callParam(
      ctx,
      typeof target === "string" ? rawParam(toWord(BigInt(target))) : target,
      buildCall(ctx, fnAbi, specs),
    );
  }
  if (pickWord !== undefined) {
    param = staticCallParam(ctx.core, encodePick(param, pickWord));
  }
  return { kind: "call", param, cat };
}
