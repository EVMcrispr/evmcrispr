/**
 * Fold/map lambda templates: compiling a helper-reference predicate into
 * the single-staticcall TEMPLATE the bounded folds and `mapWords` consume
 * (fixed Operators calldata with the element substituted at `elemOffset`).
 *
 * The predicate is applied to a marker element operand — a live word the
 * expression compiler cannot fold away — and the compiled result must be
 * exactly one Operators call whose calldata is constant except for the
 * marker word. Anything else (a build-time constant, a nested live call,
 * the element used twice) is rejected at build time: a template carries
 * no expression tree, only one substitution window.
 */
import type { Hex } from "viem";
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

/** A single-staticcall lambda template: fixed calldata for the Operators
 *  contract with the element window at `elemOffset`. */
export interface LambdaTemplate {
  template: Hex;
  elemOffset: bigint;
}

/**
 * Reduce a compiled predicate operand to a lambda template. The operand
 * must be a single `read(operators, selector, segments)` at the core with
 * every segment a RAW_BYTES literal and the element marker appearing
 * exactly once; the template is the selector plus the concatenated
 * segments with the marker window zeroed.
 */
export function extractLambdaTemplate(
  ctx: CompileCtx,
  o: Operand,
  label: string,
): LambdaTemplate {
  const fail = (why: string): never => {
    throw new ErrorException(
      `${label} must compile to a single Operators call over the element — ${why}`,
    );
  };
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
  if (
    readTarget.fetcherType !== FETCHER_TYPE.RawBytes ||
    BigInt(readTarget.paramData) !== BigInt(ctx.operators)
  ) {
    return fail("the constructed call does not target the Operators contract");
  }
  let bytes = "";
  for (const seg of segments) {
    if (seg.fetcherType !== FETCHER_TYPE.RawBytes) {
      return fail(
        "a nested live call cannot be baked into a fold template — precompute it or fold over a simpler predicate",
      );
    }
    bytes += seg.paramData.slice(2);
  }
  const marker = ELEMENT_MARKER.slice(2);
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
  const template: Hex = `0x${selector.slice(2)}${bytes.slice(0, at)}${"0".repeat(64)}${bytes.slice(at + marker.length)}`;
  return { template, elemOffset: BigInt(4 + at / 2) };
}

/**
 * Compile a lambda argument (`@map!`, `@all!`, `@any!`) into a template.
 * The lambda names an Operators-backed helper — `@bool!(>= 100)`,
 * `@num!(* 2)`, `@not!`, any helper reference whose compile face reduces
 * to one Operators call — and is applied with the element prepended to
 * its own arguments, mirroring the def-proxy partial-application
 * convention. Returns the compiled operand alongside the template so
 * callers can enforce their own result category.
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
