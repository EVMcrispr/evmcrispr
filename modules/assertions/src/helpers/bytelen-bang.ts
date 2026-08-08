import { ErrorException } from "@evmcrispr/sdk";
import { encodeData } from "../lib/combinators";
import {
  chainArgWithLens,
  combinatorCall,
  lensedDataOperand,
} from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "bytelen!",
  description:
    "The raw byte length of the return data of a call, on-chain (a uint256[] with n items is 64 + n*32 bytes).",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "address",
      description: "A `::` call expression (or chain) to measure",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@bytelen! expects a single call argument");
    }
    const arg = await chainArgWithLens(ctx, "bytelen!", node.args[0]);
    return combinatorCall(
      ctx,
      encodeData("ByteLen", lensedDataOperand(ctx, arg)),
      "Uint",
    );
  },
});
