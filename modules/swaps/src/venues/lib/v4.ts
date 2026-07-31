import { chainLabel, ErrorNotFound } from "@evmcrispr/sdk";
import type { Address } from "viem";
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import type Swaps from "../..";
import type { V4Deployment } from "../../addresses";
import { V4_FEE_TIERS } from "../../addresses";
import type { Quote, QuoteRequest, SwapPlan, SwapRequest } from "../types";

// V4 addresses native ETH directly as currency address(0): a poolKey's
// currencies are sorted numerically, so ETH is always currency0.

// v4-periphery Actions (the subset the adapter emits).
const SWAP_EXACT_IN_SINGLE = 0x06;
const SWAP_EXACT_OUT_SINGLE = 0x08;
const SETTLE_ALL = 0x0c;
const TAKE = 0x0e;
const TAKE_ALL = 0x0f;

// UniversalRouter commands.
const V4_SWAP = 0x10;
const SWEEP = 0x04;

/** UniversalRouter sentinel for "the caller of execute()". */
const MSG_SENDER: Address = "0x0000000000000000000000000000000000000001";

// The quoter functions are state-mutating-but-revert by design; declaring
// them `view` lets readContract drive them through eth_call.
const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) view returns (uint256 amountOut, uint256 gasEstimate)",
  "function quoteExactOutputSingle(QuoteExactSingleParams params) view returns (uint256 amountIn, uint256 gasEstimate)",
]);

const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

const exactInputSingleParams = parseAbiParameters(
  "((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)",
);
const exactOutputSingleParams = parseAbiParameters(
  "((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountOut, uint128 amountInMaximum, bytes hookData)",
);

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/** A quoted V4 route: the (hookless) pool plus the swap direction. */
export interface V4Route {
  poolKey: PoolKey;
  zeroForOne: boolean;
}

function toPoolKey(a: Address, b: Address, fee: number, tickSpacing: number) {
  const [currency0, currency1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks: zeroAddress,
  } satisfies PoolKey;
}

/** Best hookless pool across the standard fee tiers (single-hop only:
 *  hooked pools and multi-hop routing need an off-chain router). */
export async function quoteV4(
  module: Swaps,
  venueName: string,
  deployments: Record<number, V4Deployment>,
  req: QuoteRequest,
): Promise<Quote> {
  const client = await module.getClient();
  const deployment = deployments[req.chainId];
  if (!deployment) {
    throw new ErrorNotFound(
      `${venueName} is not deployed on ${chainLabel(req.chainId)}`,
    );
  }
  const code = await client.getCode({ address: deployment.universalRouter });
  if (!code || code === "0x") {
    throw new ErrorNotFound(
      `${venueName} router ${deployment.universalRouter} has no code on ${chainLabel(req.chainId)}`,
    );
  }

  let best: { route: V4Route; amount: bigint } | null = null;
  for (const [fee, tickSpacing] of V4_FEE_TIERS) {
    const poolKey = toPoolKey(req.tokenIn, req.tokenOut, fee, tickSpacing);
    const zeroForOne =
      poolKey.currency0.toLowerCase() === req.tokenIn.toLowerCase();
    try {
      const [amount] = await client.readContract({
        address: deployment.quoter,
        abi: quoterAbi,
        functionName:
          req.kind === "exactIn"
            ? "quoteExactInputSingle"
            : "quoteExactOutputSingle",
        args: [
          { poolKey, zeroForOne, exactAmount: req.amount, hookData: "0x" },
        ],
      });
      const better =
        !best ||
        (req.kind === "exactIn" ? amount > best.amount : amount < best.amount);
      if (better) best = { route: { poolKey, zeroForOne }, amount };
    } catch {
      // No pool (or no liquidity) at this fee tier.
    }
  }
  if (!best) {
    throw new ErrorNotFound(
      `${venueName} has no hookless pool from ${req.tokenIn} to ${req.tokenOut} on the standard fee tiers`,
    );
  }
  return req.kind === "exactIn"
    ? { amountIn: req.amount, amountOut: best.amount, route: best.route }
    : { amountIn: best.amount, amountOut: req.amount, route: best.route };
}

export function buildV4Swap(
  deployment: V4Deployment,
  route: V4Route,
  req: SwapRequest,
): SwapPlan {
  const nativeIn = req.tokenIn === zeroAddress;
  const exactIn = req.kind === "exactIn";
  const inputAmount = exactIn ? req.amount : req.limit;
  const takeToSender = req.recipient.toLowerCase() === req.from.toLowerCase();

  const swapParams = exactIn
    ? encodeAbiParameters(exactInputSingleParams, [
        {
          poolKey: route.poolKey,
          zeroForOne: route.zeroForOne,
          amountIn: req.amount,
          amountOutMinimum: req.limit,
          hookData: "0x",
        },
      ])
    : encodeAbiParameters(exactOutputSingleParams, [
        {
          poolKey: route.poolKey,
          zeroForOne: route.zeroForOne,
          amountOut: req.amount,
          amountInMaximum: req.limit,
          hookData: "0x",
        },
      ]);
  const settleParams = encodeAbiParameters(
    parseAbiParameters("address currency, uint256 maxAmount"),
    [req.tokenIn, inputAmount],
  );
  // TAKE_ALL re-checks the minimum for the sender; TAKE routes the full
  // open delta (amount 0) to a custom recipient, the swap action itself
  // already enforcing the bound.
  const takeParams = takeToSender
    ? encodeAbiParameters(
        parseAbiParameters("address currency, uint256 minAmount"),
        [req.tokenOut, exactIn ? req.limit : req.amount],
      )
    : encodeAbiParameters(
        parseAbiParameters(
          "address currency, address recipient, uint256 amount",
        ),
        [req.tokenOut, req.recipient, 0n],
      );

  const actions = encodePacked(
    ["uint8", "uint8", "uint8"],
    [
      exactIn ? SWAP_EXACT_IN_SINGLE : SWAP_EXACT_OUT_SINGLE,
      SETTLE_ALL,
      takeToSender ? TAKE_ALL : TAKE,
    ],
  );
  const v4Input = encodeAbiParameters(
    parseAbiParameters("bytes actions, bytes[] params"),
    [actions, [swapParams, settleParams, takeParams]],
  );

  const commands: number[] = [V4_SWAP];
  const inputs: `0x${string}`[] = [v4Input];
  if (nativeIn && !exactIn) {
    // Return the unspent portion of msg.value.
    commands.push(SWEEP);
    inputs.push(
      encodeAbiParameters(
        parseAbiParameters(
          "address token, address recipient, uint256 amountMin",
        ),
        [zeroAddress, MSG_SENDER, 0n],
      ),
    );
  }

  const data = encodeFunctionData({
    abi: routerAbi,
    functionName: "execute",
    args: [
      encodePacked(
        commands.map(() => "uint8" as const),
        commands,
      ),
      inputs,
      req.deadline,
    ],
  });

  return {
    actions: [
      {
        to: deployment.universalRouter,
        data,
        ...(nativeIn ? { value: inputAmount } : {}),
      },
    ],
  };
}
