import type { Param } from "@evmcrispr/sdk";
import { checkedInteger, defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  constIntArg,
  formatParamType,
  ProgramBuilder,
  programParam,
  unzipParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import {
  arrayArg,
  genericLane,
  typedValueOperand,
} from "../utils/genericCollections";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "unzip",
  description: "Transpose an array of pairs into two separate arrays.",
  compileDescription:
    "Omitting lane returns both typed lanes. An explicit lane selects 0 or 1; keys and values select the corresponding lane.",
  returnType: "array",
  args: [
    { name: "pairs", type: "array", description: "Array of [a, b] pairs" },
    {
      name: "lane",
      type: "number",
      optional: true,
      description: "Which lane to keep: 0 (first of each pair) or 1 (second)",
    },
  ],
  async run(_, { pairs, lane }) {
    const firsts: Param[] = [];
    const seconds: Param[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new ErrorException(
          `@unzip: element at index ${i} is not a two-element array`,
        );
      }
      firsts.push(pair[0]);
      seconds.push(pair[1]);
    }
    if (lane !== undefined) {
      const which = checkedInteger(lane).value;
      if (which !== 0n && which !== 1n)
        throw new ErrorException("@unzip lane must be 0 or 1");
      return which === 0n ? firsts : seconds;
    }
    return [firsts, seconds];
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1 && node.args.length !== 2) {
      throw new ErrorException(
        "@unzip! expects (call lane?) with lane 0 or 1, e.g. @unzip!($amm::reservePairs() 0)",
      );
    }

    if (node.args.length === 1) {
      const array = await arrayArg(ctx, node.args[0], "unzip!");
      if (
        array.element.type !== "tuple" ||
        !("components" in array.element) ||
        array.element.components.length !== 2
      )
        throw new ErrorException("@unzip! without a lane expects typed pairs");
      const components = array.element.components;
      const values = arrayValuesParam(ctx, array);
      const graph = new ProgramBuilder(ctx);
      const source = graph.resolve(values, "bytes[]");
      const inputs = components.map((element) => ({
        ...element,
        type: `${element.type}[]`,
      }));
      const lanes = components.map((element, lane) => {
        const selected = graph.collection("unzipValues", [
          graph.literal({ type: "string" }, formatParamType(components[0])),
          graph.literal({ type: "string" }, formatParamType(components[1])),
          source,
          graph.literal({ type: "uint256" }, BigInt(lane)),
        ]);
        const packed = graph.collection("packArray", [
          graph.literal({ type: "string" }, formatParamType(element)),
          selected,
        ]);
        return graph.asType(packed, inputs[lane]);
      });
      const resultType = { type: "tuple", components: inputs };
      return typedValueOperand(
        programParam(ctx, graph, graph.tuple(resultType, lanes)),
        resultType,
      );
    }

    const which =
      node.args.length === 2
        ? await constIntArg(ctx, "unzip!", "lane", node.args[1])
        : 0n;
    if (which !== 0n && which !== 1n) {
      throw new ErrorException("@unzip! lane must be 0 or 1");
    }
    const generic = await genericLane(
      ctx,
      node.args[0],
      Number(which) as 0 | 1,
      "unzip!",
    );
    if (generic) return generic;
    const { payload, elemType, lanes } = await wordsArg(
      ctx,
      node.args[0],
      "unzip!",
    );
    return {
      kind: "call",
      param: unzipParam(ctx, payload, which),
      cat: "Bytes",
      collection: {
        element: lanes?.[Number(which)] ?? { type: elemType },
        transport: "words",
      },
    };
  },
});
