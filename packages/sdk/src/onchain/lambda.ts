/**
 * Fold/map lambda templates: compiling a helper-reference predicate into
 * the single-staticcall TEMPLATE the bounded folds and `mapWords` consume
 * (fixed calldata for `target` with the element substituted at
 * `elemOffset`).
 *
 * The predicate is applied to a marker element operand — a live word the
 * expression compiler cannot fold away — and the compiled result must be
 * a core `read` whose calldata is constant except for the marker word.
 * A predicate reducing to ONE Operators call flattens to direct Operators
 * calldata (one staticcall per element); anything composed — nested live
 * calls, multi-call expressions — keeps the whole `read(...)` calldata as
 * the template and targets the core itself, which resolves the expression
 * per element and raw-returns the inner returndata (so the first return
 * word is still the value). The composed form costs several staticcalls
 * per element where the direct form costs one, which is why the direct
 * form is tried first. A build-time constant or an element used twice is
 * still rejected: a template carries one substitution window.
 */
import type { Address, Hex } from "viem";
import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  keccak256,
  stringToHex,
} from "viem";
import { ErrorException } from "../errors";
import type { HelperFunctionNode, Node } from "../types";
import { NodeType } from "../types";
import { operandNode } from "./compile";
import { CORE_ABI } from "./core";
import { compileOnchainHelper } from "./dispatch";
import type { InputParam } from "./erc8211";
import { FETCHER_TYPE, rawParam } from "./erc8211";
import type { Category, CompileCtx, Operand } from "./types";

/** The marker word standing in for the fold element while the predicate
 *  compiles — improbable enough that a collision with a genuine constant
 *  in the same predicate is not a practical concern. */
export const ELEMENT_MARKER: Hex = keccak256(
  stringToHex("evmcrispr/fold-element"),
);

/** The element placeholder as a live-call operand: `kind: "call"` keeps
 *  the expression compiler from constant-folding around it, and the raw
 *  marker word passes through `materializeWord` untouched. The category
 *  is the array's element category, so bool-element predicates (`@not!`)
 *  take their boolean paths. */
export function elementOperand(cat: Category = "Uint"): Operand {
  return { kind: "call", param: rawParam(ELEMENT_MARKER), cat };
}

/** A single-staticcall lambda template: fixed calldata for `target` with
 *  the element window at `elemOffset`. `target` is the Operators contract
 *  when the predicate flattened to one direct call, or the core when the
 *  template is a composed `read(...)` the core resolves per element. */
export interface LambdaTemplate {
  target: Address;
  template: Hex;
  elemOffset: bigint;
}

/**
 * Reduce a compiled predicate operand to a lambda template. The operand
 * must be a core `read` with the element marker appearing exactly once.
 * A `read(operators, selector, segments)` with every segment a RAW_BYTES
 * literal flattens to direct Operators calldata (the selector plus the
 * concatenated segments) — the single-staticcall fast path. Anything
 * else — a nested live call, a read of another contract — keeps the whole
 * `read(...)` calldata as the template and targets the core, which
 * raw-returns the inner returndata so the first return word is still the
 * value. The marker window is zeroed in either form.
 */
export function extractLambdaTemplate(
  ctx: CompileCtx,
  o: Operand,
  label: string,
): LambdaTemplate {
  const fail = (why: string): never => {
    throw new ErrorException(
      `${label} must compile to a composed read over the element — ${why}`,
    );
  };
  const marker = ELEMENT_MARKER.slice(2);
  const findWindow = (bytes: string): number => {
    const at = bytes.indexOf(marker);
    if (at === -1) {
      return fail("the element does not appear in the call");
    }
    if (at % 2 !== 0) {
      return fail("the element window is not byte-aligned");
    }
    if (bytes.indexOf(marker, at + marker.length) !== -1) {
      return fail(
        "the element may appear only once (a template has a single substitution window)",
      );
    }
    return at;
  };
  const zeroed = (bytes: string, at: number): string =>
    `${bytes.slice(0, at)}${"0".repeat(64)}${bytes.slice(at + marker.length)}`;

  if (o.kind !== "call") {
    return fail("it folded to a build-time constant");
  }
  if (o.param.fetcherType !== FETCHER_TYPE.StaticCall) {
    return fail("it resolves through a non-staticcall fetcher");
  }
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    o.param.paramData,
  ) as [Hex, Hex];
  if (getAddress(target) !== getAddress(ctx.core)) {
    return fail("it staticcalls a contract directly instead of composing");
  }
  let decoded: ReturnType<typeof decodeFunctionData>;
  try {
    decoded = decodeFunctionData({ abi: CORE_ABI, data });
  } catch {
    return fail("it is not a core read expression");
  }
  if (decoded.functionName !== "read") {
    return fail(`it compiles to the core's ${decoded.functionName}`);
  }
  const [readTarget, selector, segments] = decoded.args as unknown as [
    InputParam,
    Hex,
    readonly InputParam[],
  ];

  // Fast path: one direct Operators call, all segments literal. The
  // template flattens to the Operators calldata itself — one staticcall
  // per element.
  if (
    readTarget.fetcherType === FETCHER_TYPE.RawBytes &&
    BigInt(readTarget.paramData) === BigInt(ctx.operators) &&
    segments.every((seg) => seg.fetcherType === FETCHER_TYPE.RawBytes)
  ) {
    const bytes = segments.map((seg) => seg.paramData.slice(2)).join("");
    const at = findWindow(bytes);
    return {
      target: ctx.operators,
      template: `0x${selector.slice(2)}${zeroed(bytes, at)}`,
      elemOffset: BigInt(4 + at / 2),
    };
  }

  // Composed form: the whole `read(...)` calldata is the template and the
  // lambda targets the core. Nested live calls stay unresolved InputParams
  // in the calldata, re-resolved per element; `read` raw-returns the inner
  // returndata, so the first return word is the value either way. Costs
  // several staticcalls per element where the fast path costs one.
  const bytes = data.slice(2);
  const at = findWindow(bytes);
  return {
    target: ctx.core,
    template: `0x${zeroed(bytes, at)}`,
    elemOffset: BigInt(at / 2),
  };
}

/**
 * Compile a lambda argument (`@map!`, `@all!`, `@any!`) into a template.
 * The lambda names an Operators-backed helper — `@bool!(>= 100)`,
 * `@num!(* 2)`, `@not!`, any helper reference whose compile face reduces
 * to a core read — and is applied with the element prepended to its own
 * arguments, mirroring the def-proxy partial-application convention.
 * Returns the compiled operand alongside the template so callers can
 * enforce their own result category.
 */
export async function compileLambdaTemplate(
  ctx: CompileCtx,
  lambdaNode: Node | undefined,
  label: string,
  elemCat: Category = "Uint",
): Promise<LambdaTemplate & { operand: Operand }> {
  if (!lambdaNode || lambdaNode.type !== NodeType.HelperFunctionExpression) {
    throw new ErrorException(
      `${label} expects a helper-reference lambda, e.g. @bool!(> 100) — the element is prepended to the reference's own arguments`,
    );
  }
  const lambda = lambdaNode as HelperFunctionNode;
  const synthetic: HelperFunctionNode = {
    ...lambda,
    args: [operandNode(elementOperand(elemCat)), ...lambda.args] as never,
  };
  const o = await compileOnchainHelper(ctx, synthetic);
  return { ...extractLambdaTemplate(ctx, o, `${label} lambda`), operand: o };
}

/** {@link compileLambdaTemplate} with the boolean-result requirement of
 *  the fold predicates. */
export async function compilePredicateTemplate(
  ctx: CompileCtx,
  predNode: Node | undefined,
  label: string,
  elemCat: Category = "Uint",
): Promise<LambdaTemplate> {
  if (predNode && predNode.type === NodeType.HelperFunctionExpression) {
    // Surface the category error before the template-shape error: a
    // numeric lambda may well be a single call yet still not a predicate.
    const compiled = await compileLambdaTemplate(ctx, predNode, label, elemCat);
    if (compiled.operand.kind === "call" && compiled.operand.cat !== "Bool") {
      throw new ErrorException(
        `${label} predicate must evaluate to a boolean, got a ${compiled.operand.cat} value`,
      );
    }
    return compiled;
  }
  throw new ErrorException(
    `${label} expects a helper-reference predicate, e.g. @bool!(> 100) — the element is prepended to the reference's own arguments`,
  );
}
