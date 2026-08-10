import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  compileLambdaTemplate,
  mapWordsParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "map",
  description: "Transform each element of an array by applying a helper.",
  compileDescription:
    "The transform is a named `def @name!` of one parameter, applied by name; a composed body costs more per element.",
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
        "@map! expects (call lambda), e.g. @map!($vault::caps() @num!(* 2))",
      );
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
    };
  },
});
