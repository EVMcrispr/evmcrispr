import { defineHelper } from "@evmcrispr/sdk";
import { parseAbiItem, zeroAddress } from "viem";
import type Std from "..";
import { getChainNativeCurrency, resolveToken } from "./token";

export default defineHelper<Std>({
  name: "token.symbol",
  description: "Return the symbol of a token.",
  returnType: "string",
  args: [
    {
      name: "tokenSymbol",
      type: "token-symbol",
      description: "Token address (or symbol)",
    },
  ],
  async run(module, { tokenSymbol }) {
    const tokenAddr = await resolveToken(module, tokenSymbol);

    if (tokenAddr === zeroAddress) {
      const chain = await module.getChain();
      return getChainNativeCurrency(chain).symbol;
    }

    const client = await module.getClient();
    return client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function symbol() view returns (string)")],
      functionName: "symbol",
    });
  },
});
