import { defineHelper } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { parseAbiItem, zeroAddress } from "viem";
import type Swaps from "..";
import { resolveVenue } from "../venues/registry";

const decimalsAbi = parseAbiItem("function decimals() view returns (uint8)");

export default defineHelper<Swaps>({
  name: "price",
  batchable: false,
  description:
    "Spot price of 1 whole tokenA, expressed in base units of tokenB (the venue quote for selling 1 tokenA). Compare it against @token:amount(tokenB ...) values.",
  returnType: "number",
  args: [
    { name: "tokenA", type: "address", description: "Token being priced" },
    {
      name: "tokenB",
      type: "address",
      description: "Token the price is denominated in",
    },
    {
      name: "venue",
      type: "swap-venue",
      optional: true,
      description: "Venue to quote (default: the best venue on the chain)",
    },
  ],
  async run(module, { tokenA, tokenB, venue }) {
    const adapter = await resolveVenue(module, venue);
    const chainId = await module.getChainId();

    let decimals: number;
    if (tokenA === zeroAddress) {
      const chain = await module.getChain();
      decimals = chain?.nativeCurrency.decimals ?? 18;
    } else {
      const client = await module.getClient();
      decimals = await client.readContract({
        address: tokenA,
        abi: [decimalsAbi],
        functionName: "decimals",
      });
    }

    let from: Address | undefined;
    try {
      from = await module.getConnectedAccount();
    } catch {
      // Pricing works without a connected account on on-chain venues.
    }
    const quote = await adapter.quote(module, {
      chainId,
      tokenIn: tokenA,
      tokenOut: tokenB,
      amount: 10n ** BigInt(decimals),
      kind: "exactIn",
      from,
    });
    return quote.amountOut.toString();
  },
});
