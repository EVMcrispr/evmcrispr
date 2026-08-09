import { ErrorException } from "@evmcrispr/sdk";
import { opsCall } from "../lib/compiler";
import { encodeOperator } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "coinbase!",
  description: "The block proposer fee recipient address at assertion time.",
  returnType: "address",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@coinbase! takes no arguments");
    return opsCall(ctx, encodeOperator("coinbase"), "Address");
  },
});
