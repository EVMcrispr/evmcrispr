import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Bridges from "..";
import { resolveAdapter } from "../adapters/registry";
import { resolveChainId } from "../argTypes";

export default defineHelper<Bridges>({
  name: "fee",
  batchable: false,
  description:
    "Cost of bridging an amount to another chain, in base units of the token (the amount the bridge keeps). Messaging fees that LayerZero and CCIP charge in the native token ride on the value of the bridge action and are not included here.",
  returnType: "number",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount to bridge, in base units (wei)",
    },
    { name: "token", type: "address", description: "Token to bridge" },
    {
      name: "destChain",
      type: "chain",
      description: "Destination chain name or id",
    },
    {
      name: "adapter",
      type: "bridge-adapter",
      optional: true,
      description:
        "Adapter to quote (default: the best adapter for the token and lane)",
    },
  ],
  async run(module, { amount, token, destChain, adapter }) {
    const amountIn = Num(amount).toBigInt();
    if (amountIn <= 0n) {
      throw new ErrorException("<amount> must be greater than zero");
    }
    const srcChainId = await module.getChainId();
    const dstChainId = resolveChainId(destChain);
    if (srcChainId === dstChainId) {
      throw new ErrorException(
        `already on chain ${srcChainId}; there is nothing to bridge`,
      );
    }

    const bridge = await resolveAdapter(module, adapter, {
      srcChainId,
      dstChainId,
      token,
    });

    let from: Address | undefined;
    try {
      from = await module.getConnectedAccount();
    } catch {
      // Fee quotes work without a connected account.
    }
    const account = from ?? token;

    const quote = await bridge.quote(module, {
      srcChainId,
      dstChainId,
      token,
      amount: amountIn,
      from: account,
      recipient: account,
    });
    return quote.tokenFee.toString();
  },
});
