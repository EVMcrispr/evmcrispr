import { resolveToken } from "@evmcrispr/module-std";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { parseAbiItem, toFunctionSelector, zeroAddress } from "viem";
import type Token from "..";

export default defineHelper<Token>({
  name: "totalSupply",
  batchable: false,
  description:
    "Fetch the total supply of a token in base units. As @totalSupply! the symbol resolves at composition time and totalSupply() is read on-chain at assertion time.",
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
      throw new ErrorException("the native token has no total supply");
    }

    const client = await module.getClient();
    const totalSupply = await client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function totalSupply() view returns (uint256)")],
      functionName: "totalSupply",
    });

    return totalSupply.toString();
  },
  compile: async (ctx, node) => {
    const symbol = await ctx.interpreters.interpretNode(node.args[0]);
    const tokenAddr = await resolveToken(ctx.module, String(symbol));
    if (tokenAddr === zeroAddress) {
      throw new ErrorException("the native token has no total supply");
    }
    return {
      kind: "call",
      param: staticCallParam(
        tokenAddr,
        toFunctionSelector("function totalSupply()"),
      ),
      cat: "Uint",
    };
  },
});
