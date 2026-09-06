import { type HelperFunctionNode, type Node, NodeType } from "@evmcrispr/sdk";
import {
  ACCUMULATOR_MARKER,
  type CompileCtx,
  categoryFromAbiType,
  compileOnchainHelper,
  ELEMENT_MARKER,
  extractLambdaTemplate,
  FETCHER_TYPE,
  type LambdaTemplate,
  type Operand,
  PRECOMPILED_OPERAND,
  rawParam,
} from "@evmcrispr/sdk/onchain";
import { type AbiParameter, decodeAbiParameters, type Hex } from "viem";

const WORD = /^(u?int\d*|address|bool|bytes32)$/;

/** Optional optimization after the complete typed callback has been validated.
 * The template engine needs a word result, at least one element window and
 * at most one accumulator window. Other valid callbacks keep their graph. */
export async function wordCallbackTemplate(
  ctx: CompileCtx,
  node: Node,
  inputs: readonly AbiParameter[],
  output: AbiParameter,
): Promise<LambdaTemplate | undefined> {
  if (!WORD.test(output.type) || inputs.some((input) => !WORD.test(input.type)))
    return undefined;
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
      name: "__programParameter!",
      args: [],
      [PRECOMPILED_OPERAND]: operand,
    } as unknown as Node;
  });
  const operand = await compileOnchainHelper(ctx, {
    ...(node as HelperFunctionNode),
    args: supplied as HelperFunctionNode["args"],
  });
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
  const template = extractLambdaTemplate(ctx, operand, "word callback");
  if (
    (output.type === "bool" || output.type === "address") &&
    template.target.toLowerCase() !== ctx.operators.toLowerCase()
  )
    return undefined;
  return template;
}
