/**
 * Fold/map lambda templates: compiling a helper-reference predicate into
 * the single-staticcall TEMPLATE the bounded folds and `mapWords` consume
 * (fixed calldata for `target` with the element substituted at the
 * window(s) in `elemOffsets`).
 *
 * The predicate is applied to a marker element operand — a live word the
 * expression compiler cannot fold away — and the compiled result must be
 * a single staticcall, producing a single WORD, whose calldata is
 * constant except for the marker word(s). A predicate reducing to ONE
 * Operators call flattens to direct Operators calldata (one staticcall
 * per element); any other staticcall — a composed `read`, a `pick`, a
 * direct call on another contract — keeps its own (target, calldata)
 * verbatim. The composed core form costs several staticcalls per element
 * where a direct form costs one, which is why the Operators flattening is
 * tried first. A build-time constant or a bytes/string result is
 * rejected: the engine reads one return word. Every marker occurrence
 * becomes one `elemOffsets` entry (ascending), so a definition that names
 * its parameter more than once substitutes at each place it appears.
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
import { operandNode, PRECOMPILED_OPERAND } from "./compile";
import { CORE_ABI } from "./core";
import { lookupOnchainDef } from "./defs";
import { compileOnchainHelper } from "./dispatch";
import type { InputParam } from "./erc8211";
import { FETCHER_TYPE, rawParam } from "./erc8211";
import type { Category, CompileCtx, Operand } from "./types";

/** Shown when a face is handed something that is not a definition. */
const DEF_EXAMPLE: Record<number, string> = {
  1: 'def @big! "$x: number -> bool" @bool!($x >= 100)',
  2: 'def @sum! "$acc: number $x: number -> number" @num!($acc + $x)',
};

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

/** The accumulator's marker, for the folds that carry one. Distinct from
 *  the element's so a two-parameter definition can name both. */
export const ACCUMULATOR_MARKER: Hex = keccak256(
  stringToHex("evmcrispr/fold-accumulator"),
);

/** The accumulator placeholder, same shape as {@link elementOperand}. */
export function accumulatorOperand(cat: Category = "Uint"): Operand {
  return { kind: "call", param: rawParam(ACCUMULATOR_MARKER), cat };
}

/** A single-staticcall lambda template: fixed calldata for `target` with
 *  the element windows at `elemOffsets` (ascending byte offsets). `target`
 *  is the Operators contract when the predicate flattened to one direct
 *  call; otherwise it is the compiled staticcall's own target verbatim —
 *  the core for a composed `read` or a `pick`, another contract for a
 *  direct single call. N>1 means the definition names its parameter more
 *  than once, e.g. `@num!($x * $x)`. */
export interface LambdaTemplate {
  target: Address;
  /** Where the accumulator is stamped, when the body names it. Absent for
   *  a predicate, whose caller parks it on the first element window. */
  accOffset?: bigint;
  template: Hex;
  elemOffsets: readonly bigint[];
}

/**
 * Locate every aligned occurrence of the element marker in `bytes`
 * (hex without `0x`), returning ascending byte offsets into the template
 * after applying `base` (4 for a flattened Operators selector prefix).
 */
function findWindows(
  bytes: string,
  marker: Hex,
  what: string,
  label: string,
  base = 0,
): { offsets: bigint[]; zeroed: string } {
  const needle = marker.slice(2);
  const offsets: bigint[] = [];
  let from = 0;
  let zeroed = bytes;
  // Walk left-to-right so later overlapping writes win — matching the
  // contract's ascending stamp order (the element still wins on overlap
  // with the accumulator, because the engine writes the accumulator first).
  while (from <= zeroed.length - needle.length) {
    const at = zeroed.indexOf(needle, from);
    if (at === -1) break;
    if (at % 2 !== 0) {
      throw new ErrorException(
        `${label} must compile to a single staticcall over the element — the ${what} window is not byte-aligned`,
      );
    }
    offsets.push(BigInt(base + at / 2));
    zeroed = `${zeroed.slice(0, at)}${"0".repeat(64)}${zeroed.slice(at + needle.length)}`;
    from = at + needle.length;
  }
  return { offsets, zeroed };
}

/**
 * Both markers, with the rules the engine imposes on each.
 *
 * The element may be named any number of times: `_fold` and `_applyWords`
 * stamp every entry of the `elemOffsets` array. The ACCUMULATOR may be
 * named at most once, because the engine takes a single `accOffset` — so
 * `@num!($acc + $acc)` has nowhere to put the second one.
 *
 * A body that never names the accumulator is fine, and is what every
 * predicate does. Its `accOffset` parks on the first element window: the
 * engine writes the accumulator before the elements, so the element
 * overwrites it and the value is never read.
 */
function findAllWindows(
  bytes: string,
  label: string,
  base = 0,
): { elemOffsets: bigint[]; accOffset?: bigint; zeroed: string } {
  const elem = findWindows(bytes, ELEMENT_MARKER, "element", label, base);
  const acc = findWindows(
    elem.zeroed,
    ACCUMULATOR_MARKER,
    "accumulator",
    label,
    base,
  );
  if (elem.offsets.length === 0) {
    throw new ErrorException(
      `${label} must compile to a single staticcall over the element — the element does not appear in the call`,
    );
  }
  if (acc.offsets.length > 1) {
    throw new ErrorException(
      `${label} names the accumulator ${acc.offsets.length} times, and a fold carries exactly one accumulator window — hold it in the element side of the expression instead`,
    );
  }
  return {
    elemOffsets: elem.offsets,
    accOffset: acc.offsets[0],
    zeroed: acc.zeroed,
  };
}

/** True when `node` (or a descendant) is a precompiled operand carrying
 *  the fold-element marker — the outer element leaked into an inner
 *  lambda's AST. Same global marker as the inner binder's, so admitting
 *  it would stamp the wrong binder's windows. */
function astCapturesOuterElement(node: Node): boolean {
  const pre = (node as unknown as Record<string, unknown>)[
    PRECOMPILED_OPERAND
  ] as Operand | undefined;
  if (
    pre?.kind === "call" &&
    pre.param.fetcherType === FETCHER_TYPE.RawBytes &&
    pre.param.paramData.toLowerCase() === ELEMENT_MARKER.toLowerCase()
  ) {
    return true;
  }
  const rec = node as unknown as Record<string, unknown>;
  for (const key of ["args", "elements", "value", "target"] as const) {
    const v = rec[key];
    if (Array.isArray(v)) {
      if (v.some((k) => k != null && astCapturesOuterElement(k as Node))) {
        return true;
      }
    } else if (v && typeof v === "object" && "type" in (v as object)) {
      if (astCapturesOuterElement(v as Node)) return true;
    }
  }
  return false;
}

/**
 * Reduce a compiled predicate operand to a lambda template. The operand
 * must be a single staticcall producing a single-word value, with the
 * element marker appearing at least once in its calldata.
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
 * ABI offset, so those reject instead of silently folding offsets. Every
 * marker window is zeroed.
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
  // per element. Marker troubles (absent, misaligned) fall through: the
  // general search over the whole calldata reports them.
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
        const marker = ELEMENT_MARKER.slice(2);
        const at = bytes.indexOf(marker);
        // Prefer the flat path only when every marker sits in the
        // concatenated segments (none in the read wrapper). Otherwise the
        // general form keeps the whole read calldata.
        if (at !== -1 && at % 2 === 0) {
          const { elemOffsets, accOffset, zeroed } = findAllWindows(
            bytes,
            label,
            4,
          );
          return {
            target: ctx.operators,
            template: `0x${selector.slice(2)}${zeroed}`,
            elemOffsets,
            accOffset,
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
  const { elemOffsets, accOffset, zeroed } = findAllWindows(
    data.slice(2),
    label,
  );
  return {
    target: getAddress(target),
    template: `0x${zeroed}`,
    elemOffsets,
    accOffset,
  };
}

/**
 * Compile a lambda argument (`@map!`, `@all!`, `@filter!`, …) into a
 * template.
 *
 * The lambda is a NAMED on-chain definition, taken by name with no
 * arguments: `def @big! "$x: number -> bool" @bool!($x >= 100)` applied as
 * `@all!(caps @big!)`. The face supplies what the definition declares, as
 * precompiled marker operands, so each parameter substitutes wherever the
 * body names it — including more than once, which is how a body like
 * `@num!($x * $x)` yields two windows.
 *
 * Returns the compiled operand alongside the template so callers can
 * enforce their own result category.
 */
export async function compileLambdaTemplate(
  ctx: CompileCtx,
  lambdaNode: Node | undefined,
  label: string,
  elemCat: Category = "Uint",
  arity = 1,
): Promise<LambdaTemplate & { operand: Operand }> {
  const supplies =
    arity === 1
      ? "the face supplies the element"
      : "the face supplies the accumulator and the element";

  if (!lambdaNode || lambdaNode.type !== NodeType.HelperFunctionExpression) {
    throw new ErrorException(
      `${label} expects a named on-chain definition, e.g. ${DEF_EXAMPLE[arity] ?? DEF_EXAMPLE[1]}`,
    );
  }
  const lambda = lambdaNode as HelperFunctionNode;

  if (lambda.args.length > 0) {
    throw new ErrorException(
      `${label} takes the definition by NAME, with no arguments — ${supplies}. Write @${lambda.name} rather than @${lambda.name}(…)`,
    );
  }

  const def = lookupOnchainDef(ctx, lambda.name);
  if (!def) {
    throw new ErrorException(
      `${label} needs a \`def @name!\` definition, and @${lambda.name} is not one. Name the operation first: ${DEF_EXAMPLE[arity] ?? DEF_EXAMPLE[1]}`,
    );
  }

  const params = def.argDefs ?? [];
  if (params.length !== arity) {
    throw new ErrorException(
      `${label} applies a definition of ${arity} parameter(s), and @${lambda.name} declares ${params.length} — ${supplies}`,
    );
  }

  // An outer element smuggled into this lambda's AST as a precompiled
  // marker would share the inner binder's global marker and stamp the
  // wrong windows. Reject before compile — never wrong offsets.
  if (astCapturesOuterElement(lambda)) {
    throw new ErrorException(
      `${label} captures the outer element inside a nested lambda — the element belongs to one binder, and capturing an enclosing one is unsupported`,
    );
  }

  // The face supplies the arguments the definition declares. Each is a
  // precompiled marker operand, so it lands wherever the body names the
  // corresponding parameter — including more than once. Two parameters
  // means a fold: the accumulator first, matching `f(acc, element)`.
  const supplied =
    arity === 2
      ? [
          operandNode(accumulatorOperand(elemCat)),
          operandNode(elementOperand(elemCat)),
        ]
      : [operandNode(elementOperand(elemCat))];
  const synthetic: HelperFunctionNode = {
    ...lambda,
    args: supplied as never,
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
    `${label} expects a named on-chain definition returning bool, e.g. ${DEF_EXAMPLE[1]}`,
  );
}
