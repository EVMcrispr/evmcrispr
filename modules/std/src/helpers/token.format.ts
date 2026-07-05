import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { formatUnits, parseAbiItem, zeroAddress } from "viem";
import type Std from "..";
import { getChainNativeCurrency, resolveToken } from "./token";

export default defineHelper<Std>({
  name: "token.format",
  description:
    "Format a base-unit token amount as a human-readable string with the token symbol.",
  returnType: "string",
  args: [
    {
      name: "tokenSymbolOrAddress",
      type: "token-symbol",
      description: "Token symbol (e.g. `DAI`) or address",
    },
    { name: "amount", type: "number", description: "Amount in base units" },
  ],
  async run(module, { tokenSymbolOrAddress, amount }) {
    let value: bigint;
    try {
      value = BigInt(String(amount));
    } catch {
      throw new ErrorException(
        `expected an integer base-unit amount, but got ${amount}`,
      );
    }

    const tokenAddr = await resolveToken(module, tokenSymbolOrAddress);

    if (tokenAddr === zeroAddress) {
      const chain = await module.getChain();
      const { symbol, decimals } = getChainNativeCurrency(chain);
      return `${formatUnits(value, decimals)} ${symbol}`;
    }

    const client = await module.getClient();
    const [decimals, symbol] = await Promise.all([
      client.readContract({
        address: tokenAddr,
        abi: [parseAbiItem("function decimals() view returns (uint8)")],
        functionName: "decimals",
      }),
      client.readContract({
        address: tokenAddr,
        abi: [parseAbiItem("function symbol() view returns (string)")],
        functionName: "symbol",
      }),
    ]);
    return `${formatUnits(value, decimals)} ${symbol}`;
  },
});
