import { ErrorException } from "@evmcrispr/sdk";
import { encodeData } from "../lib/combinators";
import {
  chainArgWithLens,
  combinatorCall,
  lensedDataOperand,
} from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "hash!",
  description:
    "keccak256 of the raw return data of a call, computed on-chain — compare structs, arrays or long strings against a precomputed hash.",
  returnType: "bytes32",
  args: [
    {
      name: "call",
      type: "address",
      description: "A `::` call expression (or chain) to hash",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@hash! expects a single call argument");
    }
    const arg = await chainArgWithLens(ctx, "hash!", node.args[0]);
    return combinatorCall(
      ctx,
      encodeData("Hash", lensedDataOperand(ctx, arg)),
      "Bytes32",
    );
  },
});
