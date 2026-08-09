import { ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  hashParamOf,
  lensedDataOperand,
  requireBytesLike,
} from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "hash!",
  description:
    "keccak256 of the decoded string/bytes return of a call, computed on-chain — compare long strings or blobs against a precomputed digest of the payload bytes.",
  returnType: "bytes32",
  args: [
    {
      name: "call",
      type: "address",
      description:
        "A `::` call expression (or chain) returning a string or bytes value",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@hash! expects a single call argument");
    }
    const arg = await chainArgWithLens(ctx, "hash!", node.args[0]);
    requireBytesLike(arg, "hash!");
    return {
      kind: "call",
      param: hashParamOf(ctx, lensedDataOperand(ctx, arg)),
      cat: "Bytes32",
    };
  },
});
