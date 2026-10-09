import { type HelperFunctionNode, type Node, NodeType } from "@evmcrispr/sdk";
import {
  ACCUMULATOR_MARKER,
  type CompileCtx,
  categoryFromAbiType,
  compileOnchainHelper,
  ELEMENT_MARKER,
  extractLambdaTemplate,
  FETCHER_TYPE,
  type InputParam,
  type LambdaTemplate,
  lookupOnchainDef,
  type Operand,
  PRECOMPILED_OPERAND,
  rawParam,
  splitComparison,
} from "@evmcrispr/sdk/onchain";
import { type AbiParameter, decodeAbiParameters, type Hex } from "viem";

const WORD = /^(u?int\d*|address|bool|bytes32)$/;

/** The definition applied to marker words, one per parameter: the
 *  accumulator first when there are two. */
async function compileOverMarkers(
  ctx: CompileCtx,
  node: Node,
  inputs: readonly AbiParameter[],
): Promise<Operand> {
  const supplied = inputs.map((type, index) => {
    const marker =
      inputs.length === 2 && index === 0 ? ACCUMULATOR_MARKER : ELEMENT_MARKER;
    const operand: Operand = {
      kind: "call",
      param: rawParam(marker),
      cat: categoryFromAbiType(type.type),
      abiType: type,
    };
    return {
      type: NodeType.HelperFunctionExpression,
      name: "__graphParameter!",
      args: [],
      [PRECOMPILED_OPERAND]: operand,
    } as unknown as Node;
  });
  return compileOnchainHelper(ctx, {
    ...(node as HelperFunctionNode),
    args: supplied as HelperFunctionNode["args"],
  });
}

/** Optional optimization after the complete typed callback has been validated.
 * The template engine needs a word result, at least one element window and
 * at most one accumulator window. Other valid callbacks keep their graph.
 *
 * A literal call on a contract becomes that contract's own calldata, one
 * call per element, with the collection engine as its caller rather than
 * the core. `checkedBool` says the consumer itself refuses a result that is
 * not a canonical bool, as a word filter does: a predicate may then be any
 * single call, such as a comparison over a call. */
export async function wordCallbackTemplate(
  ctx: CompileCtx,
  node: Node,
  inputs: readonly AbiParameter[],
  output: AbiParameter,
  { checkedBool = false }: { checkedBool?: boolean } = {},
): Promise<LambdaTemplate | undefined> {
  if (!WORD.test(output.type) || inputs.some((input) => !WORD.test(input.type)))
    return undefined;
  const operand = await compileOverMarkers(ctx, node, inputs);
  if (
    operand.kind !== "call" ||
    operand.param.fetcherType !== FETCHER_TYPE.StaticCall
  )
    return undefined;
  if (operand.cat === "Bytes" || operand.cat === "String") return undefined;
  const [, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    operand.param.paramData,
  );
  const windows = (marker: Hex): number[] => {
    const offsets: number[] = [];
    const bytes = data.slice(2).toLowerCase(),
      needle = marker.slice(2).toLowerCase();
    let offset = bytes.indexOf(needle);
    while (offset !== -1) {
      offsets.push(offset);
      offset = bytes.indexOf(needle, offset + needle.length);
    }
    return offsets;
  };
  const elements = windows(ELEMENT_MARKER),
    accumulators = windows(ACCUMULATOR_MARKER);
  if (
    !elements.length ||
    accumulators.length > 1 ||
    [...elements, ...accumulators].some((offset) => offset % 2 !== 0)
  )
    return undefined;
  // Exact one-word length validates full-width integers/bytes32 by itself.
  // Narrow integers still need the generic ABI validator. For bool/address,
  // only a flattened Operations call guarantees canonical return bits here.
  if (!/^(uint256|int256|bytes32|bool|address)$/.test(output.type))
    return undefined;
  const template = extractLambdaTemplate(ctx, operand, "word callback", {
    direct: true,
  });
  if (
    (output.type === "address" || (output.type === "bool" && !checkedBool)) &&
    template.target.toLowerCase() !== ctx.operators.toLowerCase()
  )
    return undefined;
  return template;
}

/** A predicate `f(element) <cmp> bound` as `reduceWords` runs it: the
 *  lambda template for `f`, and the comparison applied to each result. */
export interface WordReduction extends LambdaTemplate {
  cmp: number;
  bound: bigint | InputParam;
}

/**
 * The single-call form of a predicate over a word element, when it has
 * one: a comparison between a call over the element and a value that does
 * not depend on it. `reduceWords` then makes one call per element and
 * compares the result itself, where the whole predicate as a lambda would
 * resolve the comparison's operands on every element.
 *
 * The call's result is compared as the raw word it returns, exactly as
 * the comparison would receive it; a call straight onto a contract sees
 * the collection engine as its caller rather than the core. Any other
 * predicate returns undefined and keeps the path it had.
 */
export async function wordReduction(
  ctx: CompileCtx,
  node: Node,
  element: AbiParameter,
): Promise<WordReduction | undefined> {
  if (!WORD.test(element.type)) return undefined;
  if (node.type !== NodeType.HelperFunctionExpression) return undefined;
  const call = node as HelperFunctionNode;
  const def = lookupOnchainDef(ctx, call.name);
  if (def?.argDefs.length !== 1 || call.args.length) return undefined;
  // A bare call returning bool has no comparison to lift, and its result
  // must stay a validated bool.
  if (def.bodyNode.type === NodeType.CallExpression) return undefined;
  const operand = await compileOverMarkers(ctx, node, [element]);
  const split = splitComparison(ctx, operand);
  if (!split) return undefined;
  const template = extractLambdaTemplate(
    ctx,
    { kind: "call", cat: "Uint", param: split.inner },
    "word reduction",
    { direct: true },
  );
  return { ...template, cmp: split.cmp, bound: split.bound };
}
