import { getChainNativeCurrency, resolveToken } from "@evmcrispr/module-std";
import { defineHelper } from "@evmcrispr/sdk";
import { parseAbiItem, zeroAddress } from "viem";
import type Token from "..";

export default defineHelper<Token>({
  name: "decimals",
  description: "Return the number of decimals of a token.",
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
});
