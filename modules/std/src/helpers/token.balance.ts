import { defineHelper } from "@evmcrispr/sdk";
import { formatUnits, parseAbiItem, zeroAddress } from "viem";
import type Std from "..";
import { getChainNativeCurrency, resolveToken } from "./token";

export default defineHelper<Std>({
  name: "token.balance",
  description: "Fetch the token balance of an address in base units.",
  returnType: "number",
  args: [
    { name: "tokenSymbol", type: "token-symbol" },
    { name: "holder", type: "address" },
  ],
  async run(module, { tokenSymbol, holder }) {
    const tokenAddr = await resolveToken(module, tokenSymbol);
    const client = await module.getClient();

    if (tokenAddr === zeroAddress) {
      const chain = await module.getChain();
      const { decimals } = getChainNativeCurrency(chain);
      const balance = await client.getBalance({ address: holder });
      return formatUnits(balance, decimals);
    }

    const balance = await client.readContract({
      address: tokenAddr,
      abi: [
        parseAbiItem("function balanceOf(address owner) view returns (uint)"),
      ],
      functionName: "balanceOf",
      args: [holder],
    });

    return balance.toString();
  },
});
