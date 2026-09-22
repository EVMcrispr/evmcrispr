import type { Action, NodesInterpreters } from "@evmcrispr/sdk";
import type { RuntimeValue, SmartAmount } from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import type Swaps from "..";

/**
 * How a venue produces its swaps:
 * - "onchain": quote and calldata derive purely from chain state, so the
 *   venue stays deterministic under sim:fork.
 * - "api": quote/calldata come from an HTTP service; skipped by default
 *   venue resolution while a sim fork is active.
 * - "intent": signs an order via a wallet action and posts it off-chain;
 *   never picked implicitly and rejected inside batches and forks.
 */
export type VenueKind = "onchain" | "api" | "intent";

export interface QuoteRequest {
  chainId: number;
  /** zeroAddress means the chain's native token. */
  tokenIn: Address;
  tokenOut: Address;
  /** Base units of tokenIn (exactIn) or tokenOut (exactOut). */
  amount: bigint;
  kind: "exactIn" | "exactOut";
  /** Sender; API venues need it to build calldata. Absent when quoting
   *  without a connected account. */
  from?: Address;
}

export interface Quote {
  amountIn: bigint;
  amountOut: bigint;
  /** Opaque venue route data (V3 fee tier, aggregator calldata...) threaded
   *  into buildSwap so the swap executes the quoted route. */
  route?: unknown;
}

export interface SwapRequest extends Omit<QuoteRequest, "amount"> {
  amount: SmartAmount;
  /** Explicit V3/V4 route fee for amounts that cannot be quoted at build time. */
  fee?: number;
  from: Address;
  /** minOut (exactIn) / maxIn (exactOut), already slippage-adjusted. */
  limit: SmartAmount;
  /** Raw slippage for API venues that take it natively. */
  slippageBps: number;
  recipient: Address | RuntimeValue;
  /** Unix timestamp. */
  deadline: SmartAmount;
  skipApproval?: boolean;
  /** Reuse when the command already quoted this request. */
  quote?: Quote;
}

export interface SwapPlan {
  /** ERC-20 spender the auto-approve logic must fund. Undefined when
   *  tokenIn is native or the venue needs no ERC-20 approval. */
  approvalTarget?: Address;
  /** Amount the approval must cover; defaults to the input amount/limit. */
  approvalAmount?: SmartAmount;
  /** Actions to run after any auto-approve action ([] for intent venues). */
  actions: Action[];
}

export interface VenueAdapter {
  /** Canonical display name, e.g. "UniswapV3". */
  name: string;
  kind: VenueKind;
  supportsExactOut: boolean;
  /** Static address-book check (sync so completions can use it). */
  supports(chainId: number): boolean;
  quote(module: Swaps, req: QuoteRequest): Promise<Quote>;
  buildSwap(
    module: Swaps,
    req: SwapRequest,
    ctx: { interpreters: NodesInterpreters },
  ): Promise<SwapPlan>;
}

/** API routes and signed orders require concrete quote inputs. */
export function requireConcreteSwap(
  req: SwapRequest,
): asserts req is SwapRequest & {
  amount: bigint;
  limit: bigint;
  recipient: Address;
  deadline: bigint;
} {
  if (
    typeof req.amount !== "bigint" ||
    typeof req.limit !== "bigint" ||
    typeof req.recipient !== "string" ||
    typeof req.deadline !== "bigint"
  )
    throw new Error(
      "this venue requires build-time amount, bounds, deadline, and recipient for its external quote",
    );
}
