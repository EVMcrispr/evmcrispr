import { chainLabel, ErrorNotFound } from "@evmcrispr/sdk";
import type { Address, PublicClient } from "viem";
import { encodeFunctionData, encodePacked, parseAbi, zeroAddress } from "viem";
import type Swaps from "../..";
import type { V3Deployment } from "../../addresses";
import { V3_FEE_TIERS, WRAPPED_NATIVE } from "../../addresses";
import type {
  Quote,
  QuoteRequest,
  SwapPlan,
  SwapRequest,
  VenueAdapter,
} from "../types";

// SwapRouter02 sentinel: recipient meaning "the router itself" (used to
// hold WETH for a trailing unwrapWETH9 call).
const ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";

// QuoterV2 functions are state-mutating-but-revert by design; declaring
// them `view` lets readContract drive them through eth_call.
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) view returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
  "function exactOutput((bytes path, address recipient, uint256 amountOut, uint256 amountInMaximum) params) payable returns (uint256 amountIn)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function refundETH() payable",
]);

/** A quoted V3 route: hop tokens plus the fee tier of each hop. */
export interface V3Route {
  tokens: Address[];
  fees: number[];
}

interface LegQuote {
  fee: number;
  amount: bigint;
}

/** Best single-pool quote for one hop, scanning the standard fee tiers.
 *  Returns null when no tier has a pool/liquidity. */
async function quoteLeg(
  client: PublicClient,
  quoter: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: bigint,
  kind: "exactIn" | "exactOut",
): Promise<LegQuote | null> {
  let best: LegQuote | null = null;
  for (const fee of V3_FEE_TIERS) {
    try {
      if (kind === "exactIn") {
        const [amountOut] = await client.readContract({
          address: quoter,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            { tokenIn, tokenOut, amountIn: amount, fee, sqrtPriceLimitX96: 0n },
          ],
        });
        if (!best || amountOut > best.amount) best = { fee, amount: amountOut };
      } else {
        const [amountIn] = await client.readContract({
          address: quoter,
          abi: quoterAbi,
          functionName: "quoteExactOutputSingle",
          args: [{ tokenIn, tokenOut, amount, fee, sqrtPriceLimitX96: 0n }],
        });
        if (!best || amountIn < best.amount) best = { fee, amount: amountIn };
      }
    } catch {
      // No pool (or no liquidity) at this fee tier.
    }
  }
  return best;
}

export async function quoteV3(
  module: Swaps,
  venueName: string,
  deployments: Record<number, V3Deployment>,
  req: QuoteRequest,
): Promise<Quote> {
  const client = await module.getClient();
  const deployment = deployments[req.chainId];
  if (!deployment) {
    throw new ErrorNotFound(
      `${venueName} is not deployed on ${chainLabel(req.chainId)}`,
    );
  }
  const code = await client.getCode({ address: deployment.router });
  if (!code || code === "0x") {
    throw new ErrorNotFound(
      `${venueName} router ${deployment.router} has no code on ${chainLabel(req.chainId)}`,
    );
  }

  const wrapped = WRAPPED_NATIVE[req.chainId];
  if (
    !wrapped &&
    (req.tokenIn === zeroAddress || req.tokenOut === zeroAddress)
  ) {
    throw new ErrorNotFound(
      `no wrapped-native token known for ${chainLabel(req.chainId)}`,
    );
  }
  const tokenIn = req.tokenIn === zeroAddress ? wrapped : req.tokenIn;
  const tokenOut = req.tokenOut === zeroAddress ? wrapped : req.tokenOut;

  // Direct pool first.
  const direct = await quoteLeg(
    client,
    deployment.quoter,
    tokenIn,
    tokenOut,
    req.amount,
    req.kind,
  );
  if (direct) {
    const route: V3Route = { tokens: [tokenIn, tokenOut], fees: [direct.fee] };
    return req.kind === "exactIn"
      ? { amountIn: req.amount, amountOut: direct.amount, route }
      : { amountIn: direct.amount, amountOut: req.amount, route };
  }

  // Fallback: hop through the wrapped native token (best tier per leg).
  if (tokenIn !== wrapped && tokenOut !== wrapped) {
    if (req.kind === "exactIn") {
      const leg1 = await quoteLeg(
        client,
        deployment.quoter,
        tokenIn,
        wrapped,
        req.amount,
        "exactIn",
      );
      const leg2 =
        leg1 &&
        (await quoteLeg(
          client,
          deployment.quoter,
          wrapped,
          tokenOut,
          leg1.amount,
          "exactIn",
        ));
      if (leg1 && leg2) {
        const route: V3Route = {
          tokens: [tokenIn, wrapped, tokenOut],
          fees: [leg1.fee, leg2.fee],
        };
        return { amountIn: req.amount, amountOut: leg2.amount, route };
      }
    } else {
      const leg2 = await quoteLeg(
        client,
        deployment.quoter,
        wrapped,
        tokenOut,
        req.amount,
        "exactOut",
      );
      const leg1 =
        leg2 &&
        (await quoteLeg(
          client,
          deployment.quoter,
          tokenIn,
          wrapped,
          leg2.amount,
          "exactOut",
        ));
      if (leg1 && leg2) {
        const route: V3Route = {
          tokens: [tokenIn, wrapped, tokenOut],
          fees: [leg1.fee, leg2.fee],
        };
        return { amountIn: leg1.amount, amountOut: req.amount, route };
      }
    }
  }

  throw new ErrorNotFound(
    `${venueName} has no liquidity path from ${req.tokenIn} to ${req.tokenOut}`,
  );
}

/** Pack a V3 route as the router expects: token(20) fee(3) token(20)...
 *  exactOutput paths are encoded in reverse (output token first). */
function encodePath(route: V3Route, reverse: boolean): `0x${string}` {
  const tokens = reverse ? [...route.tokens].reverse() : route.tokens;
  const fees = reverse ? [...route.fees].reverse() : route.fees;
  const types: ("address" | "uint24")[] = ["address"];
  const values: (Address | number)[] = [tokens[0]];
  for (let i = 0; i < fees.length; i++) {
    types.push("uint24", "address");
    values.push(fees[i], tokens[i + 1]);
  }
  return encodePacked(types, values);
}

export function buildV3Swap(
  deployment: V3Deployment,
  route: V3Route,
  req: SwapRequest,
): SwapPlan {
  const nativeIn = req.tokenIn === zeroAddress;
  const nativeOut = req.tokenOut === zeroAddress;
  const swapRecipient = nativeOut ? ADDRESS_THIS : req.recipient;
  const calls: `0x${string}`[] = [];

  if (req.kind === "exactIn") {
    if (route.fees.length === 1) {
      calls.push(
        encodeFunctionData({
          abi: routerAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: route.tokens[0],
              tokenOut: route.tokens[1],
              fee: route.fees[0],
              recipient: swapRecipient,
              amountIn: req.amount,
              amountOutMinimum: req.limit,
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
      );
    } else {
      calls.push(
        encodeFunctionData({
          abi: routerAbi,
          functionName: "exactInput",
          args: [
            {
              path: encodePath(route, false),
              recipient: swapRecipient,
              amountIn: req.amount,
              amountOutMinimum: req.limit,
            },
          ],
        }),
      );
    }
    if (nativeOut) {
      calls.push(
        encodeFunctionData({
          abi: routerAbi,
          functionName: "unwrapWETH9",
          args: [req.limit, req.recipient],
        }),
      );
    }
  } else {
    if (route.fees.length === 1) {
      calls.push(
        encodeFunctionData({
          abi: routerAbi,
          functionName: "exactOutputSingle",
          args: [
            {
              tokenIn: route.tokens[0],
              tokenOut: route.tokens[1],
              fee: route.fees[0],
              recipient: swapRecipient,
              amountOut: req.amount,
              amountInMaximum: req.limit,
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
      );
    } else {
      calls.push(
        encodeFunctionData({
          abi: routerAbi,
          functionName: "exactOutput",
          args: [
            {
              path: encodePath(route, true),
              recipient: swapRecipient,
              amountOut: req.amount,
              amountInMaximum: req.limit,
            },
          ],
        }),
      );
    }
    if (nativeOut) {
      calls.push(
        encodeFunctionData({
          abi: routerAbi,
          functionName: "unwrapWETH9",
          args: [req.amount, req.recipient],
        }),
      );
    }
    if (nativeIn) {
      // Return the unspent portion of msg.value.
      calls.push(
        encodeFunctionData({ abi: routerAbi, functionName: "refundETH" }),
      );
    }
  }

  const data = encodeFunctionData({
    abi: routerAbi,
    functionName: "multicall",
    args: [req.deadline, calls],
  });
  const inputAmount = req.kind === "exactIn" ? req.amount : req.limit;

  return {
    ...(nativeIn
      ? {}
      : { approvalTarget: deployment.router, approvalAmount: inputAmount }),
    actions: [
      {
        to: deployment.router,
        data,
        ...(nativeIn ? { value: inputAmount } : {}),
      },
    ],
  };
}

/** Build a VenueAdapter for a UniswapV3-style deployment set. */
export function makeV3Venue(
  name: string,
  deployments: Record<number, V3Deployment>,
): VenueAdapter {
  return {
    name,
    kind: "onchain",
    supportsExactOut: true,
    supports: (chainId) => chainId in deployments,

    async quote(module, req) {
      return quoteV3(module, name, deployments, req);
    },

    async buildSwap(module, req) {
      const route =
        (req.quote?.route as V3Route | undefined) ??
        ((await quoteV3(module, name, deployments, req)).route as V3Route);
      return buildV3Swap(deployments[req.chainId], route, req);
    },
  };
}
