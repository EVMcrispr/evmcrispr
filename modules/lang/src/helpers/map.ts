import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  categoryFromAbiType,
  collectionReadParam,
  compileCollectionCallback,
  compileLambdaTemplate,
  formatParamType,
  lookupOnchainDef,
  mapWordsParam,
  packedArrayOperand,
  typedArrayArg,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "map",
  description: "Transform each element of an array by applying a helper.",
  compileDescription:
    "Word transforms may compose on-chain helpers. Generic values require a named definition containing one direct ABI call with matching argument and result types.",
  returnType: "array",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
    {
      name: "fn",
      type: "helper",
      description: "Transform helper applied to each element",
    },
  ],
  async run(_, { arr, fn }) {
    const results = [];
    for (const item of arr) {
      results.push(await fn(item));
    }
    return results;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@map! expects (call transform), e.g. @map!($vault::caps() @dbl!) with def @dbl! "$x: number -> number" @calc!($x * 2)',
      );
    }
    const array = await typedArrayArg(ctx, node.args[0], "map!");
    const def =
      node.args[1]?.type === NodeType.HelperFunctionExpression
        ? lookupOnchainDef(ctx, node.args[1].name)
        : undefined;
    if (!array.words || def?.bodyNode.type === NodeType.CallExpression) {
      const { callbackSpec, output } = await compileCollectionCallback(
        ctx,
        node.args[1],
        [array.element],
      );
      const values = arrayValuesParam(ctx, array);
      const result = collectionReadParam(ctx, "mapValues", [
        { kind: "value", value: formatParamType(array.element) },
        { kind: "value", value: formatParamType(output) },
        canonicalArgSpec(ctx, { type: "bytes[]" }, values),
        callbackSpec,
      ]);
      return packedArrayOperand(ctx, result, output);
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "map!");
    const tpl = await compileLambdaTemplate(
      ctx,
      node.args[1],
      "@map!",
      categoryFromAbiType(elemType),
    );
    return {
      kind: "call",
      param: mapWordsParam(
        ctx,
        payload,
        tpl.target,
        tpl.template,
        tpl.elemOffsets,
      ),
      cat: "Bytes",
      collection: {
        element: {
          type:
            tpl.operand.cat === "Int"
              ? "int256"
              : tpl.operand.cat === "Bool"
                ? "bool"
                : tpl.operand.cat === "Address"
                  ? "address"
                  : tpl.operand.cat === "Bytes32"
                    ? "bytes32"
                    : "uint256",
        },
        transport: "words",
      },
    };
  },
});
