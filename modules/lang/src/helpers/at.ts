import { defineHelper, ErrorException, NodeType, Num } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  categoryFromAbiType,
  chainArgWithLens,
  constIntArg,
  encodeNav,
  formatParamType,
  formatReturnTuple,
  staticCallParam,
  typedArrayArg,
  unwrapBytesParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "at",
  description: "Access an element by index in an array.",
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
    const i = Num(index).toNumber();
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
    if (node.args[0].type === NodeType.CallExpression) {
      const arg = await chainArgWithLens(ctx, "at!", node.args[0]);
      const type = arg.terminal ?? arg.outputs[0];
      if (!type || !/\[\d*\]$/.test(type.type))
        throw new ErrorException("@at! needs an array value");
      const element = { ...type, type: type.type.replace(/\[\d*\]$/, "") };
      if (!element.type.startsWith("tuple") && !element.type.includes("[")) {
        const index = await constIntArg(ctx, "at!", "index", node.args[1]);
        return {
          kind: "call",
          cat: categoryFromAbiType(element.type),
          abiType: element,
          param: staticCallParam(
            ctx.core,
            encodeNav(arg.param, formatReturnTuple(arg.outputs), [
              ...(arg.path ?? [0]).map(BigInt),
              index,
            ]),
          ),
        };
      }
    }
    const array = await typedArrayArg(ctx, node.args[0], "at!");
    const index = await constIntArg(ctx, "at!", "index", node.args[1]);
    const element = array.element;
    const scalar =
      !element.type.startsWith("tuple") && !element.type.includes("[");
    const param = scalar
      ? staticCallParam(
          ctx.core,
          encodeNav(array.param, `(${formatParamType(element)}[])`, [
            0n,
            index,
          ]),
        )
      : unwrapBytesParam(
          ctx,
          staticCallParam(
            ctx.core,
            encodeNav(arrayValuesParam(ctx, array), "(bytes[])", [0n, index]),
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
