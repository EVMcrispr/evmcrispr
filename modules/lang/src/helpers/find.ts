import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  COLLECTIONS_ABI,
  CONSTRAINT_TYPE,
  CORE_ABI,
  compileCollectionCallback,
  formatParamType,
  ProgramBuilder,
  programParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import { type AbiFunction, toFunctionSelector } from "viem";
import type Lang from "..";
import { arrayArg, typedValueOperand } from "../utils/genericCollections";

export default defineHelper<Lang>({
  name: "find",
  description:
    "First element that satisfies the predicate; no match is an error.",
  compileDescription:
    "Returns the first matching typed value and stops evaluating predicates immediately; no match reverts.",
  returnType: "any",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
    {
      name: "fn",
      type: "helper",
      description: "Predicate helper returning bool",
    },
  ],
  async run(_, { arr, fn }) {
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") {
        return item;
      }
    }
    throw new ErrorException("@find: no element matched the predicate");
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2)
      throw new ErrorException("@find! expects an array and a predicate");
    const array = await arrayArg(ctx, node.args[0], "find!");
    const { callback, output } = await compileCollectionCallback(
      ctx,
      node.args[1],
      [array.element],
    );
    if (output.type !== "bool")
      throw new ErrorException("@find! predicate must return bool");
    const graph = new ProgramBuilder(ctx);
    const values = graph.resolve(arrayValuesParam(ctx, array), "bytes[]");
    const findFn = COLLECTIONS_ABI.find(
      (f) => f.type === "function" && f.name === "findValues",
    ) as AbiFunction;
    const find = graph.collection("findValues", [
      graph.literal({ type: "string" }, formatParamType(array.element)),
      values,
      graph.literal(findFn.inputs[2], callback),
    ]);
    const resolve = CORE_ABI.find((f) => f.name === "resolve") as AbiFunction;
    const index = graph.call(
      graph.literal({ type: "address" }, ctx.core),
      toFunctionSelector(resolve),
      resolve.inputs,
      [
        graph.rawInput(graph.wrap(find), [
          {
            constraintType: CONSTRAINT_TYPE.Lte,
            referenceData: toWord((1n << 255n) - 1n),
          },
        ]),
      ],
      "int256",
    );
    const nav = CORE_ABI.find((f) => f.name === "nav") as AbiFunction;
    const selected = graph.call(
      graph.literal({ type: "address" }, ctx.core),
      toFunctionSelector(nav),
      nav.inputs,
      [
        graph.rawInput(graph.wrap(values)),
        graph.literal({ type: "string" }, "(bytes[])"),
        graph.array("int256", [graph.literal({ type: "int256" }, 0n), index]),
      ],
      "bytes",
    );
    return typedValueOperand(
      programParam(ctx, graph, graph.asType(selected, array.element)),
      array.element,
    );
  },
});
