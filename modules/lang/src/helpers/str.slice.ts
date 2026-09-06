import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import {
  byteIndex,
  byteRangeParam,
  decodeStringSlice,
} from "../utils/byteIndex";

export default defineHelper<Lang>({
  name: "str.slice",
  description:
    "Extract a UTF-8 byte range, with clamped indexes and complete characters.",
  compileDescription:
    "Slices UTF-8 bytes; ranges cutting through a character are rejected.",
  returnType: "string",
  args: [
    {
      name: "value",
      type: "string",
      description: "Source string or bytes value",
    },
    {
      name: "start",
      type: "number",
      description: "Start index (inclusive; negative counts from the end)",
    },
    {
      name: "end",
      type: "number",
      description:
        "End index (exclusive; negative counts from the end; omitted = to the end)",
      optional: true,
    },
  ],
  async run(_, { value, start, end }) {
    const s = byteIndex(start);
    const e = end !== undefined ? byteIndex(end) : undefined;
    return decodeStringSlice(
      new TextEncoder().encode(String(value)).slice(s, e),
    );
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2 || node.args.length > 3) {
      throw new ErrorException(
        "@str.slice! expects (call start end?), e.g. @str.slice!($pool::name() 0 5)",
      );
    }
    const arg = await chainArgWithLens(ctx, "str.slice!", node.args[0]);
    requireBytesLike(arg, "str.slice!");
    const source = lensedDataOperand(ctx, arg);
    return {
      kind: "call",
      param: await byteRangeParam(
        ctx,
        source,
        node.args[1],
        node.args[2],
        true,
        false,
      ),
      cat: "String",
    };
  },
});
