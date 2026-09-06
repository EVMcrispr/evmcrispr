import type { ArrayExpressionNode, Node, Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import {
  arrayValuesParam,
  COLLECTIONS_ADDRESS,
  canonicalArgSpec,
  canonicalBytesParam,
  collectionReadParam,
  concatParam,
  formatParamType,
  isBangHelperNode,
  packedArrayOperand,
  typedArrayArg,
  unwrapBytesParam,
} from "@evmcrispr/sdk/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import type Lang from "..";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "flat",
  description: "Flatten one level of nesting in an array.",
  compileDescription:
    "Flattens runtime nested arrays or a literal list of word-array parts, preserving element types.",
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
    if (
      node.args.length === 1 &&
      node.args[0].type !== NodeType.ArrayExpression
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
      return packedArrayOperand(ctx, flattened, element);
    }
    if (
      node.args.length !== 1 ||
      node.args[0].type !== NodeType.ArrayExpression
    ) {
      throw new ErrorException(
        "@flat! expects an array literal of parts, e.g. @flat!([[1 2] $safe::getOwners()])",
      );
    }
    const elements = (node.args[0] as ArrayExpressionNode)
      .elements as unknown as Node[];
    const parts: BytesPart[] = [];
    let elemType: string | undefined;
    for (const element of elements) {
      if (
        element.type === NodeType.CallExpression ||
        isBangHelperNode(element)
      ) {
        const part = await wordsArg(ctx, element, "flat!");
        if (elemType && elemType !== part.elemType)
          throw new ErrorException(
            "@flat! requires matching array element types",
          );
        elemType = part.elemType;
        parts.push({ param: part.payload, aligned: true });
      } else {
        parts.push(await constWordsPayload(ctx, element, "flat!"));
      }
    }
    return {
      kind: "call",
      param: concatParam(ctx, parts),
      cat: "Bytes",
      collection: {
        element: { type: elemType ?? "uint256" },
        transport: "words",
      },
    };
  },
});
