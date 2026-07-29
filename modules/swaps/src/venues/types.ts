import type { Action, NodesInterpreters } from "@evmcrispr/sdk";
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

export interface SwapRequest extends QuoteRequest {
  from: Address;
  /** minOut (exactIn) / maxIn (exactOut), already slippage-adjusted. */
  limit: bigint;
  /** Raw slippage for API venues that take it natively. */
  slippageBps: number;
  recipient: Address;
  /** Unix timestamp. */
  deadline: bigint;
  /** Reuse when the command already quoted this request. */
  quote?: Quote;
}

export interface SwapPlan {
  /** ERC-20 spender the auto-approve logic must fund. Undefined when
   *  tokenIn is native or the venue needs no ERC-20 approval. */
  approvalTarget?: Address;
  /** Amount the approval must cover; defaults to the input amount/limit. */
  approvalAmount?: bigint;
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
