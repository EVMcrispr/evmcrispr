import { resolveToken } from "@evmcrispr/module-std";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { readTarget, targetCallParam } from "@evmcrispr/sdk/onchain";
import { parseAbiItem, toFunctionSelector, zeroAddress } from "viem";
import type Token from "..";

export default defineHelper<Token>({
  name: "totalSupply",
  batchable: false,
  description: "Total supply of a token, in base units.",
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
    const token = await readTarget(ctx, "totalSupply!", node.args[0], (value) =>
      resolveToken(ctx.module, String(value)),
    );
    if (token === zeroAddress) {
      throw new ErrorException("the native token has no total supply");
    }
    return {
      kind: "call",
      param: targetCallParam(
        ctx,
        token,
        toFunctionSelector("function totalSupply()"),
      ),
      cat: "Uint",
    };
  },
});
