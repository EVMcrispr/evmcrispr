import { getChainNativeCurrency, resolveToken } from "@evmcrispr/module-std";
import { defineHelper, Num } from "@evmcrispr/sdk";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { parseAbiItem, toFunctionSelector, zeroAddress } from "viem";
import type Token from "..";

export default defineHelper<Token>({
  name: "decimals",
  description: "Number of decimals of a token.",
  returnType: "number",
  args: [
    {
      name: "tokenSymbol",
      type: "token-symbol",
      description: "Token symbol (e.g. `DAI`) or address",
    },
  ],
  async run(module, { tokenSymbol }) {
    const tokenAddr = await resolveToken(module, tokenSymbol);

    if (tokenAddr === zeroAddress) {
      const chain = await module.getChain();
      return String(getChainNativeCurrency(chain).decimals);
    }

    const client = await module.getClient();
    const decimals = await client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function decimals() view returns (uint8)")],
      functionName: "decimals",
    });

    return String(decimals);
  },
  compile: async (ctx, node) => {
    const symbol = await ctx.interpreters.interpretNode(node.args[0]);
    const tokenAddr = await resolveToken(ctx.module, String(symbol));
    if (tokenAddr === zeroAddress) {
      const chain = await ctx.module.getChain();
      return {
        kind: "const",
        cat: "Uint",
        value: Num.fromBigInt(BigInt(getChainNativeCurrency(chain).decimals)),
      };
    }
    return {
      kind: "call",
      param: staticCallParam(
        tokenAddr,
        toFunctionSelector("function decimals()"),
      ),
      cat: "Uint",
    };
  },
});
