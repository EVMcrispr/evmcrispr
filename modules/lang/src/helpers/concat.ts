import {
  defineHelper,
  ErrorException,
  encodeParams,
  NodeType,
} from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import {
  arrayValuesParam,
  canonicalArgSpec,
  canonicalBytesParam,
  collectionReadParam,
  concatParam,
  encodeValuesParam,
  formatParamType,
  isBangHelperNode,
  packedArrayOperand,
  rawParam,
  typedArrayArg,
  unwrapBytesParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "concat",
  description: "Concatenate arrays together.",
  compileDescription:
    "Up to 4 parts may be live calls; each live part past the first is re-resolved by every later part's offset.",
  returnType: "array",
  args: [
    {
      name: "first",
      type: "array",
      description: "First array to concatenate",
    },
    {
      name: "rest",
      type: "array",
      description: "Additional arrays to append",
      rest: true,
    },
  ],
  async run(_, { first, rest }) {
    return [first, ...rest].flat();
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2) {
      throw new ErrorException(
        "@concat! expects at least two array parts, e.g. @concat!($safe::getOwners() [1 2])",
      );
    }
    const arrays = await Promise.all(
      node.args.map((arg) =>
        arg.type === NodeType.CallExpression || isBangHelperNode(arg)
          ? typedArrayArg(ctx, arg, "concat!")
          : undefined,
      ),
    );
    const typed = arrays.find(Boolean);
    if (typed && arrays.some((a) => a && !a.words)) {
      const type = formatParamType(typed.element);
      const parts: BytesPart[] = [];
      for (let i = 0; i < node.args.length; i++) {
        const array = arrays[i];
        if (array && formatParamType(array.element) !== type)
          throw new ErrorException(
            "@concat! requires matching array element types",
          );
        const source = array ?? {
          element: typed.element,
          param: rawParam(
            encodeParams(
              [{ ...typed.element, type: `${typed.element.type}[]` }],
              [await ctx.interpreters.interpretNode(node.args[i])] as never,
              "concat array",
            ),
          ),
        };
        parts.push(canonicalBytesParam(ctx, arrayValuesParam(ctx, source)));
      }
      const nested = unwrapBytesParam(
        ctx,
        collectionReadParam(ctx, "packArray", [
          { kind: "value", value: "bytes[]" },
          canonicalArgSpec(
            ctx,
            { type: "bytes[]" },
            encodeValuesParam(ctx, parts),
          ),
        ]),
      );
      return packedArrayOperand(
        ctx,
        collectionReadParam(ctx, "flattenValues", [
          canonicalArgSpec(ctx, { type: "bytes[][]" }, nested),
        ]),
        typed.element,
      );
    }
    const parts: BytesPart[] = [];
    let elemType: string | undefined;
    for (const argNode of node.args) {
      if (
        argNode.type === NodeType.CallExpression ||
        isBangHelperNode(argNode)
      ) {
        const part = await wordsArg(ctx, argNode, "concat!");
        if (elemType && elemType !== part.elemType)
          throw new ErrorException(
            "@concat! requires matching array element types",
          );
        elemType = part.elemType;
        parts.push({ param: part.payload, aligned: true });
      } else {
        parts.push(await constWordsPayload(ctx, argNode, "concat!"));
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
