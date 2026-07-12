import { encodeAction, Num } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import { PERMIT2, UNISWAP_V4 } from "../addresses";
import type { V4Route } from "./lib/v4";
import { buildV4Swap, quoteV4 } from "./lib/v4";
import type { VenueAdapter } from "./types";

const MAX_UINT48 = (1n << 48n) - 1n;

const uniswapV4: VenueAdapter = {
  name: "UniswapV4",
  kind: "onchain",
  supportsExactOut: true,
  supports: (chainId) => chainId in UNISWAP_V4,

  async quote(module, req) {
    return quoteV4(module, "UniswapV4", UNISWAP_V4, req);
  },

  async buildSwap(module, req) {
    const route =
      (req.quote?.route as V4Route | undefined) ??
      ((await quoteV4(module, "UniswapV4", UNISWAP_V4, req)).route as V4Route);
    const deployment = UNISWAP_V4[req.chainId];
    const plan = buildV4Swap(deployment, route, req);

    if (req.tokenIn !== zeroAddress) {
      // Two-step allowance: the command's auto-approve funds the ERC20 ->
      // Permit2 allowance, and this action lets Permit2 pass it on to the
      // Universal Router until the swap deadline.
      const inputAmount = req.kind === "exactIn" ? req.amount : req.limit;
      const expiration = req.deadline > MAX_UINT48 ? MAX_UINT48 : req.deadline;
      plan.approvalTarget = PERMIT2;
      plan.approvalAmount = inputAmount;
      plan.actions.unshift(
        encodeAction(PERMIT2, "approve(address,address,uint160,uint48)", [
          req.tokenIn,
          deployment.universalRouter,
          Num.fromBigInt(inputAmount),
          Num.fromBigInt(expiration),
        ]),
      );
    }
    return plan;
  },
};

export default uniswapV4;
