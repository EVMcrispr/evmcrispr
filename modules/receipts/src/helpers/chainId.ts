import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "chainId",
  batchable: false,
  description:
    "The chain id. Unlike assert-chainid it composes into expressions.",
  returnType: "number",
  args: [],
  async run(module) {
    const client = await module.getClient();
    return Num(BigInt(await client.getChainId()));
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@chainId! takes no arguments");
    return opsCall(ctx, encodeOperator("chainId"), "Uint");
  },
});
