import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  canonicalBytesParam,
  categoryFromAbiType,
  chainArgWithLens,
  collectionReadParam,
  compileCheckedExpr,
  compileOnchainHelper,
  constBigInt,
  encodeValuesParam,
  formatParamType,
  formatReturnTuple,
  isBangHelperNode,
  rawParam,
  toWord,
  unwrapBytesParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import {
  arrayArg,
  indexedNav,
  indexParam,
  indexValue,
  typedValueOperand,
} from "../utils/genericCollections";

export default defineHelper<Lang>({
  name: "at",
  description: "Access an element by index in an array.",
  compileDescription:
    "Accepts a constant or live signed index; negative indices count from the end and out-of-range indices revert.",
  returnType: "any",
  args: [
    {
      name: "value",
      type: "array",
      description: "Source array",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based index (negative counts from the end)",
    },
  ],
  async run(_, { value, index }) {
    const i = Number(indexValue(index));
    const resolved = i < 0 ? value.length + i : i;

    if (resolved < 0 || resolved >= value.length) {
      throw new ErrorException(
        `@at: index ${i} out of bounds for length ${value.length}`,
      );
    }

    return value[resolved];
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@at! expects (call index), e.g. @at!($safe::getOwners() 0)",
      );
    }
    if (isBangHelperNode(node.args[0])) {
      const operand = await compileOnchainHelper(ctx, node.args[0]);
      if (
        operand.kind === "call" &&
        !operand.collection &&
        operand.abiType?.type === "tuple" &&
        "components" in operand.abiType
      ) {
        const components = operand.abiType.components;
        if (components.length !== 2)
          throw new ErrorException(
            "@at! tuple projection currently requires a pair",
          );
        const index = await compileCheckedExpr(ctx, [node.args[1]]);
        if (index.kind !== "const")
          throw new ErrorException(
            "@at! a heterogeneous tuple requires a constant index to determine its result type",
          );
        const n = constBigInt(index);
        const lane = n < 0n ? n + 2n : n;
        if (lane < 0n || lane > 1n)
          throw new ErrorException("@at! tuple index out of bounds");
        const values = collectionReadParam(ctx, "unzipValues", [
          { kind: "value", value: formatParamType(components[0]) },
          { kind: "value", value: formatParamType(components[1]) },
          canonicalArgSpec(
            ctx,
            { type: "bytes[]" },
            encodeValuesParam(ctx, [canonicalBytesParam(ctx, operand.param)]),
          ),
          { kind: "word", param: rawParam(toWord(lane)) },
        ]);
        return typedValueOperand(
          unwrapBytesParam(
            ctx,
            indexedNav(ctx, values, "(bytes[])", [0n], rawParam(toWord(0n))),
          ),
          components[Number(lane)],
        );
      }
    }
    if (node.args[0].type === NodeType.CallExpression) {
      const arg = await chainArgWithLens(ctx, "at!", node.args[0]);
      const type = arg.terminal ?? arg.outputs[0];
      if (!type || !/\[\d*\]$/.test(type.type))
        throw new ErrorException("@at! needs an array value");
      const element = { ...type, type: type.type.replace(/\[\d*\]$/, "") };
      if (!element.type.startsWith("tuple") && !element.type.includes("[")) {
        const index = await indexParam(ctx, node.args[1]);
        return {
          kind: "call",
          cat: categoryFromAbiType(element.type),
          abiType: element,
          param: indexedNav(
            ctx,
            arg.param,
            formatReturnTuple(arg.outputs),
            (arg.path ?? [0]).map(BigInt),
            index,
          ),
        };
      }
    }
    const array = await arrayArg(ctx, node.args[0], "at!");
    const index = await indexParam(ctx, node.args[1]);
    const element = array.element;
    const scalar =
      !element.type.startsWith("tuple") && !element.type.includes("[");
    const param = scalar
      ? indexedNav(
          ctx,
          array.param,
          `(${formatParamType(element)}[])`,
          [0n],
          index,
        )
      : unwrapBytesParam(
          ctx,
          indexedNav(
            ctx,
            arrayValuesParam(ctx, array),
            "(bytes[])",
            [0n],
            index,
          ),
        );
    return {
      kind: "call",
      param,
      cat:
        element.type.startsWith("tuple") || element.type.includes("[")
          ? "Bytes"
          : categoryFromAbiType(element.type),
      abiType: element,
      ...(element.type.endsWith("[]")
        ? {
            collection: {
              element: { ...element, type: element.type.slice(0, -2) },
              transport: "abi" as const,
            },
          }
        : {}),
    };
  },
});
