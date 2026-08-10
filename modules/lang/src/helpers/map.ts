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
    "The transform must be an Operators-backed helper reducing to one call, e.g. `@num!(* 2)`, with the element prepended to its arguments.",
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
      param: mapWordsParam(ctx, payload, tpl.template, tpl.elemOffset),
      cat: "Bytes",
    };
  },
});
