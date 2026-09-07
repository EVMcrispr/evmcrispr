import type { ArrayExpressionNode, Node } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import {
  buildCall,
  callParam,
  canonicalArgSpec,
  chainArgWithLens,
  compileOnchainHelper,
  concatParam,
  encodeValuesParam,
  isBangHelperNode,
  lensedDataOperand,
  rawParam,
  requireBytesLike,
  toWord,
  typedArrayArg,
} from "@evmcrispr/sdk/onchain";
import { type AbiFunction, parseAbiItem, stringToHex } from "viem";
import type Lang from "..";
import { stringArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "str.join",
  description: "Join array elements into a string with a delimiter.",
  compileDescription:
    "Array elements must be strings or bytes; literal arrays support live parts. The delimiter may be constant or live.",
  returnType: "string",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
    { name: "delim", type: "string", description: "Delimiter string" },
  ],
  async run(_, { arr, delim }) {
    return arr.map((el: unknown) => String(el)).join(String(delim));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException("@str.join! expects (array delimiter)");
    }
    const delimiter = await stringArg(
      ctx,
      node.args[1],
      "str.join!",
      "delimiter",
    );
    if (
      node.args[0].type !== NodeType.ArrayExpression ||
      delimiter.text === undefined
    ) {
      let arrayParam;
      if (node.args[0].type === NodeType.ArrayExpression) {
        const parts: BytesPart[] = [];
        for (const element of (node.args[0] as ArrayExpressionNode)
          .elements as unknown as Node[]) {
          const { part } = await stringArg(
            ctx,
            element,
            "str.join!",
            "element",
          );
          parts.push(part);
        }
        arrayParam = encodeValuesParam(ctx, parts);
      } else {
        const array = await typedArrayArg(ctx, node.args[0], "str.join!");
        if (array.element.type !== "string" && array.element.type !== "bytes") {
          throw new ErrorException(
            "@str.join! runtime arrays must contain strings or bytes",
          );
        }
        arrayParam = array.param;
      }
      const fn = parseAbiItem(
        "function concat(bytes[],bytes) pure returns (bytes)",
      ) as AbiFunction;
      const call = buildCall(ctx, fn, [
        canonicalArgSpec(ctx, { type: "bytes[]" }, arrayParam),
        typeof delimiter.part === "string"
          ? { kind: "value", value: delimiter.part }
          : canonicalArgSpec(
              ctx,
              { type: "bytes" },
              "param" in delimiter.part ? delimiter.part.param : delimiter.part,
            ),
      ]);
      return {
        kind: "call",
        cat: "String",
        param: callParam(ctx, rawParam(toWord(BigInt(ctx.operators))), call),
      };
    }
    const elements = (node.args[0] as ArrayExpressionNode)
      .elements as unknown as Node[];
    const delim = delimiter.text;
    // The delimiter interleaves between the parts at composition time:
    // constant runs (part + delimiter + part …) merge into ONE constant
    // concat part, so the whole join is a single Operations.concat call
    // with no join function on-chain.
    const parts: BytesPart[] = [];
    let constRun: string | null = null;
    const flushConstRun = () => {
      if (constRun !== null) {
        parts.push(stringToHex(constRun));
        constRun = null;
      }
    };
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const sep = i > 0 ? delim : "";
      let live: BytesPart | undefined;
      if (element.type === NodeType.CallExpression) {
        const arg = await chainArgWithLens(ctx, "str.join!", element);
        requireBytesLike(arg, "str.join!");
        live = lensedDataOperand(ctx, arg);
      } else if (isBangHelperNode(element)) {
        const o = await compileOnchainHelper(ctx, element);
        if (o.kind !== "call" || (o.cat !== "String" && o.cat !== "Bytes")) {
          throw new ErrorException(
            "@str.join! live parts must resolve string/bytes values",
          );
        }
        live = o.param;
      }
      if (live) {
        if (sep) constRun = (constRun ?? "") + sep;
        flushConstRun();
        parts.push(live);
        continue;
      }
      const value = await ctx.interpreters.interpretNode(element);
      if (typeof value !== "string") {
        throw new ErrorException("@str.join! constant parts must be strings");
      }
      constRun = (constRun ?? "") + sep + value;
    }
    flushConstRun();
    return {
      kind: "call",
      param: concatParam(ctx, parts),
      cat: "String",
    };
  },
});
