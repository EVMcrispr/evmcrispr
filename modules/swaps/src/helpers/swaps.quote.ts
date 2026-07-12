import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Swaps from "..";
import { resolveVenue } from "../venues/registry";

export default defineHelper<Swaps>({
  name: "swaps.quote",
  batchable: false,
  description:
    "Expected output of an exact-in swap, in base units of tokenOut. Quotes the same venue swap would use (or the one given), so it feeds --min directly.",
  returnType: "number",
  args: [
    {
      name: "amountIn",
      type: "number",
      description: "Amount of tokenIn to sell, in base units (wei)",
    },
    { name: "tokenIn", type: "address", description: "Token to sell" },
    { name: "tokenOut", type: "address", description: "Token to buy" },
    {
      name: "venue",
      type: "swap-venue",
      optional: true,
      description: "Venue to quote (default: the best venue on the chain)",
    },
  ],
  async run(module, { amountIn, tokenIn, tokenOut, venue }) {
    const amount = Num(amountIn).toBigInt();
    if (amount <= 0n) {
      throw new ErrorException("<amountIn> must be greater than zero");
    }
    const adapter = await resolveVenue(module, venue);
    const chainId = await module.getChainId();
    let from: Address | undefined;
    try {
      from = await module.getConnectedAccount();
    } catch {
      // Quoting works without a connected account on on-chain venues.
    }
    const quote = await adapter.quote(module, {
      chainId,
      tokenIn,
      tokenOut,
      amount,
      kind: "exactIn",
      from,
    });
    return quote.amountOut.toString();
  },
});
