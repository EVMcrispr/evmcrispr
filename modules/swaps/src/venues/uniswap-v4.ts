import { ErrorException, encodeAction } from "@evmcrispr/sdk";
import {
  amountParam,
  isRuntimeValue,
  smartOperation,
} from "@evmcrispr/sdk/onchain";
import { zeroAddress } from "viem";
import { PERMIT2, UNISWAP_V4, V4_FEE_TIERS } from "../addresses";
import type { V4Route } from "./lib/v4";
import { buildV4Swap, quoteV4, toPoolKey } from "./lib/v4";
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
    let route = req.quote?.route as V4Route | undefined;
    if (req.fee !== undefined) {
      const tier = V4_FEE_TIERS.find(([fee]) => fee === req.fee);
      if (!tier)
        throw new ErrorException(
          "--fee must select a supported hookless V4 fee tier",
        );
      const poolKey = toPoolKey(req.tokenIn, req.tokenOut, tier[0], tier[1]);
      route = {
        poolKey,
        zeroForOne:
          req.tokenIn.toLowerCase() === poolKey.currency0.toLowerCase(),
      };
    }
    if (!route) {
      if (isRuntimeValue(req.amount))
        throw new ErrorException(
          "runtime V4 swaps require --fee and an explicit --min/--max bound",
        );
      route = (
        await quoteV4(module, "UniswapV4", UNISWAP_V4, {
          ...req,
          amount: req.amount,
        })
      ).route as V4Route;
    }
    const deployment = UNISWAP_V4[req.chainId];
    const plan = buildV4Swap(deployment, route, req, module);

    if (req.tokenIn !== zeroAddress && !req.skipApproval) {
      // Two-step allowance: the command's auto-approve funds the ERC20 ->
      // Permit2 allowance, and this action lets Permit2 pass it on to the
      // Universal Router until the swap deadline.
      const inputAmount = req.kind === "exactIn" ? req.amount : req.limit;
      const expiration = smartOperation(
        module,
        "min",
        req.deadline,
        MAX_UINT48,
      );
      plan.approvalTarget = PERMIT2;
      plan.approvalAmount = inputAmount;
      plan.actions.unshift(
        encodeAction(PERMIT2, "approve(address,address,uint160,uint48)", [
          req.tokenIn,
          deployment.universalRouter,
          amountParam(inputAmount),
          amountParam(expiration),
        ]),
      );
    }
    return plan;
  },
};

export default uniswapV4;
