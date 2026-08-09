import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "chainid",
  batchable: false,
  description:
    "The chain id: read at script build time as @chainid, on-chain at assertion time as @chainid! — unlike assert-chainid both compose into expressions.",
  returnType: "number",
  args: [],
  async run(module) {
    const client = await module.getClient();
    return Num(BigInt(await client.getChainId()));
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@chainid! takes no arguments");
    return opsCall(ctx, encodeOperator("chainId"), "Uint");
  },
});
