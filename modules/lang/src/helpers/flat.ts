import type {
  ArrayExpressionNode,
  DestructurePatternNode,
  Node,
  Param,
} from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  COLLECTIONS_ADDRESS,
  canonicalArgSpec,
  canonicalBytesParam,
  collectionReadParam,
  concatArrayOperand,
  formatParamType,
  packedArrayOperand,
  typedArrayArg,
  typedArrayParts,
  unwrapBytesParam,
} from "@evmcrispr/sdk/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "flat",
  description: "Flatten one level of nesting in an array.",
  compileDescription:
    "Flattens runtime nested arrays or a literal list of compatible array parts, preserving element types.",
  returnType: "array",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array of arrays",
    },
  ],
  async run(_, { arr }) {
    const result: Param[] = [];
    for (const item of arr) {
      if (Array.isArray(item)) {
        result.push(...item);
      } else {
        result.push(item);
      }
    }
    return result;
  },
  compile: async (ctx, node) => {
    const input = node.args[0];
    // The parser represents [] as an empty destructuring pattern.
    const empty =
      input?.type === NodeType.DestructurePattern &&
      (input as DestructurePatternNode).slots.length === 0;
    if (
      node.args.length === 1 &&
      input.type !== NodeType.ArrayExpression &&
      !empty
    ) {
      const array = await typedArrayArg(ctx, node.args[0], "flat!");
      if (!array.element.type.endsWith("[]"))
        throw new ErrorException(
          "@flat! runtime input must be an array of arrays",
        );
      const element = {
        ...array.element,
        type: array.element.type.slice(0, -2),
      };
      const outerValues = arrayValuesParam(ctx, array);
      // Wrap each canonical inner-array encoding as an ABI bytes value so
      // unpackArray's bytes argument receives the correct extra envelope.
      const wrapped = collectionReadParam(ctx, "unpackArray", [
        { kind: "value", value: "bytes" },
        canonicalArgSpec(
          ctx,
          { type: "bytes" },
          canonicalBytesParam(ctx, outerValues),
        ),
      ]);
      const mapped = collectionReadParam(ctx, "mapValues", [
        { kind: "value", value: "bytes" },
        { kind: "value", value: "bytes[]" },
        canonicalArgSpec(ctx, { type: "bytes[]" }, wrapped),
        {
          kind: "value",
          value: {
            target: ctx.collections ?? COLLECTIONS_ADDRESS,
            selector: toFunctionSelector("unpackArray(string,bytes)"),
            arguments: "(string,bytes)",
            constants: [
              encodeAbiParameters(
                [{ type: "string" }],
                [formatParamType(element)],
              ),
              "0x",
            ],
            first: 1n,
            second: 0n,
            expression: "0x",
          } as never,
        },
      ]);
      const nested = unwrapBytesParam(
        ctx,
        collectionReadParam(ctx, "packArray", [
          { kind: "value", value: "bytes[]" },
          canonicalArgSpec(ctx, { type: "bytes[]" }, mapped),
        ]),
      );
      const flattened = collectionReadParam(ctx, "flattenValues", [
        { kind: "value", value: formatParamType(element) },
        canonicalArgSpec(ctx, { type: "bytes[][]" }, nested),
      ]);
      return packedArrayOperand(ctx, flattened, element, { validated: true });
    }
    if (
      node.args.length !== 1 ||
      (input.type !== NodeType.ArrayExpression && !empty)
    ) {
      throw new ErrorException(
        "@flat! expects an array literal of parts, e.g. @flat!([[1 2] $safe::getOwners()])",
      );
    }
    const elements = empty
      ? []
      : ((input as ArrayExpressionNode).elements as unknown as Node[]);
    return concatArrayOperand(
      ctx,
      await typedArrayParts(ctx, elements, "flat!"),
      "flat!",
    );
  },
});
