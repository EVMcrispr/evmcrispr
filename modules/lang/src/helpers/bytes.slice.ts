import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { byteIndex, byteRangeParam } from "../utils/byteIndex";

export default defineHelper<Lang>({
  name: "bytes.slice",
  description: "Extract a byte range from a bytes value.",
  returnType: "bytes",
  args: [
    {
      name: "value",
      type: "bytes",
      description: "Source bytes or string value",
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
    const bytes = String(value).slice(2).match(/.{2}/g) ?? [];
    return `0x${bytes.slice(s, e).join("")}`;
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2 || node.args.length > 3) {
      throw new ErrorException(
        "@bytes.slice! expects (call start end?), e.g. @bytes.slice!($oracle::blob() 0 4)",
      );
    }
    const arg = await chainArgWithLens(ctx, "bytes.slice!", node.args[0]);
    requireBytesLike(arg, "bytes.slice!");
    const source = lensedDataOperand(ctx, arg);
    return {
      kind: "call",
      param: await byteRangeParam(
        ctx,
        source,
        node.args[1],
        node.args[2],
        false,
        false,
      ),
      cat: "Bytes",
    };
  },
});
