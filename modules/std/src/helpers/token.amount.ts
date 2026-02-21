import { defineHelper } from "@evmcrispr/sdk";
import { parseAbiItem, parseUnits, zeroAddress } from "viem";
import type Std from "..";
import { getChainNativeCurrency, resolveToken } from "./token";

export default defineHelper<Std>({
  name: "token.amount",
  description:
    "Convert a human-readable token amount to its base unit (applying decimals).",
  returnType: "number",
  args: [
    { name: "tokenSymbolOrAddress", type: "token-symbol" },
    { name: "amount", type: "number" },
  ],
  async run(module, { tokenSymbolOrAddress, amount }) {
    const tokenAddr = await resolveToken(module, tokenSymbolOrAddress);

    if (tokenAddr === zeroAddress) {
      const chain = await module.getChain();
      const { decimals } = getChainNativeCurrency(chain);
      return parseUnits(String(amount), decimals).toString();
    }

    const client = await module.getClient();
    const decimals = await client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function decimals() view returns (uint8)")],
      functionName: "decimals",
    });
    return parseUnits(String(amount), decimals).toString();
  },
});
