/**
 * P1 read-face plumbing: compile a known-ABI single read against a
 * composition-time-resolved target into an operand. Literal arguments
 * compile to plain calldata (a direct staticcall); live arguments (`::`
 * calls or on-chain helpers) fold the call into a core `read` splice.
 * Arguments arrive as AST nodes or as pre-resolved `{ value }` defaults.
 */
import type { AbiFunction, Address } from "viem";
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
import { buildCallSegments } from "./construct";
import { encodePick, encodeRead } from "./core";
import type { InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";
import type { Category, CompileCtx, Operand } from "./types";

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
  if (
    node.type === NodeType.CallExpression ||
    (node.type === NodeType.HelperFunctionExpression &&
      (node as { name?: string }).name?.endsWith("!")) ||
    // An operand a caller already compiled (operandNode) is a value like
    // any other; without this it would fall through to the interpreter,
    // which sees only the synthetic bareword.
    PRECOMPILED_OPERAND in (node as unknown as Record<string, unknown>)
  ) {
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
 * argument is a build-time value, a core read splice when any is live.
 * `pickWord` unwraps one word of a multi-value return through a core
 * `pick` (the same service `directReadOperand` provides for build-time
 * calldata), so the operand stays a single word wherever it
 * nests — a constraint only inspects the first word, but a nested splice
 * would otherwise carry the whole returndata.
 */
export async function callReadOperand(
  ctx: CompileCtx,
  target: Address,
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
  if (specs.every((s) => s.kind === "value")) {
    const values = specs.map((s) => (s as { value: unknown }).value);
    param = staticCallParam(target, encodeCalldata(fnAbi, values as never));
  } else {
    const call = buildCallSegments(ctx, fnAbi, specs);
    param = staticCallParam(
      ctx.core,
      encodeRead(
        rawParam(toWord(BigInt(target))),
        call.selector,
        call.segments,
      ),
    );
  }
  if (pickWord !== undefined) {
    param = staticCallParam(ctx.core, encodePick(param, pickWord));
  }
  return { kind: "call", param, cat };
}
