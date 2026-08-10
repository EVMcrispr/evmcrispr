/**
 * Fold/map lambda templates: compiling a helper-reference predicate into
 * the single-staticcall TEMPLATE the bounded folds and `mapWords` consume
 * (fixed calldata for `target` with the element substituted at
 * `elemOffset`).
 *
 * The predicate is applied to a marker element operand — a live word the
 * expression compiler cannot fold away — and the compiled result must be
 * a single staticcall, producing a single WORD, whose calldata is
 * constant except for the marker word. A predicate reducing to ONE
 * Operators call flattens to direct Operators calldata (one staticcall
 * per element); any other staticcall — a composed `read`, a `pick`, a
 * direct call on another contract — keeps its own (target, calldata)
 * verbatim. The composed core form costs several staticcalls per element
 * where a direct form costs one, which is why the Operators flattening is
 * tried first. A build-time constant, an element used twice, or a
 * bytes/string result is rejected: a template carries one substitution
 * window and the engine reads one return word.
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
 *  when the predicate flattened to one direct call; otherwise it is the
 *  compiled staticcall's own target verbatim — the core for a composed
 *  `read(...)` or a `pick`, another contract for a direct single call. */
export interface LambdaTemplate {
  target: Address;
  template: Hex;
  elemOffset: bigint;
}

/**
 * Reduce a compiled predicate operand to a lambda template. The operand
 * must be a single staticcall producing a single-word value, with the
 * element marker appearing exactly once in its calldata.
 *
 * A core `read(operators, selector, segments)` with every segment a
 * RAW_BYTES literal flattens to direct Operators calldata (the selector
 * plus the concatenated segments) — the single-staticcall fast path. Any
 * other staticcall keeps its `(target, calldata)` pair verbatim, which is
 * exactly the call its fetcher would have made: a composed core `read`
 * re-resolves its nested live calls per element and raw-returns the inner
 * returndata, a core `pick` returns its word, and a single call on
 * another contract folds directly at that contract. In every accepted
 * form the FIRST return word is the value — which is what the
 * word-category guard protects: a bytes/string result's first word is its
 * ABI offset, so those reject instead of silently folding offsets. The
 * marker window is zeroed in either form.
 */
export function extractLambdaTemplate(
  ctx: CompileCtx,
  o: Operand,
  label: string,
): LambdaTemplate {
  const fail = (why: string): never => {
    throw new ErrorException(
      `${label} must compile to a single staticcall over the element — ${why}`,
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
        "the element may appear only once — a template has a single substitution window, and a nested lambda capturing the outer element collides with its own element marker",
      );
    }
    return at;
  };
  const zeroed = (bytes: string, at: number): string =>
    `${bytes.slice(0, at)}${"0".repeat(64)}${bytes.slice(at + marker.length)}`;

  if (o.kind !== "call") {
    return fail("it folded to a build-time constant");
  }
  if (o.cat === "Bytes" || o.cat === "String") {
    return fail(
      `it produces a ${o.cat} value, and the engine reads ONE return word per element — a bytes/string result's first word is its ABI offset, not the value`,
    );
  }
  if (o.param.fetcherType !== FETCHER_TYPE.StaticCall) {
    return fail("it resolves through a non-staticcall fetcher");
  }
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    o.param.paramData,
  ) as [Hex, Hex];

  // Fast path: one direct Operators call, all segments literal. The
  // template flattens to the Operators calldata itself — one staticcall
  // per element. Marker troubles (absent, misaligned, duplicated) fall
  // through: the general search over the whole calldata reports them.
  if (getAddress(target) === getAddress(ctx.core)) {
    let decoded: ReturnType<typeof decodeFunctionData> | undefined;
    try {
      decoded = decodeFunctionData({ abi: CORE_ABI, data });
    } catch {
      decoded = undefined;
    }
    if (decoded?.functionName === "read") {
      const [readTarget, selector, segments] = decoded.args as unknown as [
        InputParam,
        Hex,
        readonly InputParam[],
      ];
      if (
        readTarget.fetcherType === FETCHER_TYPE.RawBytes &&
        BigInt(readTarget.paramData) === BigInt(ctx.operators) &&
        segments.every((seg) => seg.fetcherType === FETCHER_TYPE.RawBytes)
      ) {
        const bytes = segments.map((seg) => seg.paramData.slice(2)).join("");
        const at = bytes.indexOf(marker);
        if (
          at !== -1 &&
          at % 2 === 0 &&
          bytes.indexOf(marker, at + marker.length) === -1
        ) {
          return {
            target: ctx.operators,
            template: `0x${selector.slice(2)}${zeroed(bytes, at)}`,
            elemOffset: BigInt(4 + at / 2),
          };
        }
      }
    }
  }

  // General form: the staticcall's own (target, calldata) verbatim. For a
  // composed core read the nested live calls stay unresolved InputParams
  // in the calldata, re-resolved per element — several staticcalls per
  // element where the fast path costs one. A non-core single call folds
  // directly at its contract, as cheap as the fast path.
  const bytes = data.slice(2);
  const at = findWindow(bytes);
  return {
    target: getAddress(target),
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
