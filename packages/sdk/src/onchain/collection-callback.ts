import type { AbiFunction, AbiParameter, Hex } from "viem";
import { getAddress, parseAbiItem, toFunctionSelector } from "viem";
import { ErrorException } from "../errors";
import type { CallExpressionNode, HelperFunctionNode, Node } from "../types";
import { NodeType } from "../types";
import { encodeParams } from "../utils/encoders";
import {
  type CollectionCallback,
  canonicalArgSpec,
  canonicalBytesParam,
  concatenateResolved,
  encodeValuesParam,
} from "./collections";
import {
  compileArgSpecs,
  formatParamType,
  formatReturnTuple,
  loadFunctionAbi,
} from "./compile";
import { type ArgSpec, buildCallSegments } from "./construct";
import { lookupOnchainDef } from "./defs";
import { rawParam, toWord } from "./erc8211";
import type { BytesPart } from "./recipes";
import type { CompileCtx } from "./types";

/** Generic callbacks substitute complete ABI argument slots, never byte windows. */
export async function compileCollectionCallback(
  ctx: CompileCtx,
  node: Node,
  inputs: readonly AbiParameter[],
): Promise<{
  callback: CollectionCallback;
  callbackSpec: ArgSpec;
  output: AbiParameter;
}> {
  if (node.type !== NodeType.HelperFunctionExpression)
    throw new ErrorException(
      "Generic collection callback must be a named definition",
    );
  const def = lookupOnchainDef(ctx, (node as HelperFunctionNode).name);
  if (
    !def ||
    def.bodyNode.type !== NodeType.CallExpression ||
    def.argDefs.length !== inputs.length
  )
    throw new ErrorException(
      "Generic collection callback needs a named definition containing one direct ABI call with matching parameter count",
    );
  const body = def.bodyNode as CallExpressionNode;
  if (body.bang || body.returnDestructure)
    throw new ErrorException(
      "Generic collection callback requires a direct inline ABI call without a lens",
    );
  const target = getAddress(
    String(await ctx.interpreters.interpretNode(body.target)),
  );
  const fn =
    body.inputTypes && body.outputTypes
      ? (parseAbiItem(
          `function ${body.method}${body.inputTypes} view returns ${body.outputTypes}`,
        ) as AbiFunction)
      : await loadFunctionAbi(ctx.module, target, body.method);
  if (fn.outputs.length !== 1)
    throw new ErrorException(
      "Generic collection callback must return one ABI value (use a single tuple return for structs)",
    );
  for (let i = 0; i < inputs.length; i++) {
    const annotation = def.argDefs[i].abiType;
    if (
      annotation &&
      formatParamType(annotation) !== formatParamType(inputs[i])
    )
      throw new ErrorException(
        `Callback annotation for $${def.argDefs[i].name} does not match ${formatParamType(inputs[i])}`,
      );
  }
  if (
    def.returnAbiType &&
    formatParamType(def.returnAbiType) !== formatParamType(fn.outputs[0])
  )
    throw new ErrorException(
      "Callback return ABI annotation does not match its direct call return",
    );
  const slots: number[] = [];
  const constants: Hex[] = [];
  const captures: BytesPart[] = [];
  let live = false;
  for (let i = 0; i < fn.inputs.length; i++) {
    const arg = body.args[i];
    const variable =
      arg?.type === NodeType.VariableIdentifier
        ? (arg as { value: string }).value
        : undefined;
    const index = variable
      ? def.argDefs.findIndex((p) => `$${p.name}` === variable)
      : -1;
    if (index >= 0) {
      if (slots[index] !== undefined)
        throw new ErrorException(
          "Generic callbacks may use each parameter in one complete argument slot only",
        );
      if (formatParamType(fn.inputs[i]) !== formatParamType(inputs[index]))
        throw new ErrorException(
          `Callback parameter ${variable} must have ABI type ${formatParamType(inputs[index])}`,
        );
      slots[index] = i;
      constants.push("0x");
      captures.push("0x");
    } else {
      const spec = (
        await compileArgSpecs(
          ctx,
          [arg],
          { ...fn, inputs: [fn.inputs[i]] },
          "collection callback capture",
        )
      )[0];
      if (spec.kind === "value") {
        const encoded = encodeParams(
          [fn.inputs[i]],
          [spec.value] as never,
          "collection callback capture",
        );
        constants.push(encoded);
        captures.push(encoded);
      } else {
        live = true;
        constants.push("0x");
        captures.push(canonicalBytesParam(ctx, spec.param));
      }
    }
  }
  if (inputs.some((_, i) => slots[i] === undefined))
    throw new ErrorException(
      "Generic callback must use each parameter in one whole argument slot",
    );
  const callback: CollectionCallback = {
    target,
    selector: toFunctionSelector(fn),
    arguments: formatReturnTuple(fn.inputs),
    constants,
    first: BigInt(slots[0]),
    second: BigInt(slots[1] ?? 0),
  };
  let callbackSpec: ArgSpec = { kind: "value", value: callback as never };
  if (live) {
    const tupleFn = parseAbiItem(
      "function callback(address target,bytes4 selector,string arguments,bytes[] constants,uint256 first,uint256 second)",
    ) as AbiFunction;
    const encoded = buildCallSegments(ctx, tupleFn, [
      { kind: "value", value: target },
      { kind: "value", value: callback.selector },
      { kind: "value", value: callback.arguments },
      canonicalArgSpec(
        ctx,
        { type: "bytes[]" },
        encodeValuesParam(ctx, captures),
      ),
      { kind: "value", value: callback.first as never },
      { kind: "value", value: callback.second as never },
    ]);
    const param = concatenateResolved(ctx, [
      rawParam(toWord(32n)),
      ...encoded.segments,
    ]);
    callbackSpec = canonicalArgSpec(
      ctx,
      { type: "tuple", components: tupleFn.inputs },
      param,
    );
  }
  return { callback, callbackSpec, output: fn.outputs[0] };
}
