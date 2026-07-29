import type { Action } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Lending from "..";

/**
 * How an adapter produces its actions:
 * - "onchain": calldata and reads derive purely from chain state, so the
 *   adapter stays deterministic under sim:fork.
 * - "api": relies on an HTTP service; skipped by default adapter resolution
 *   while a sim fork is active.
 */
export type LendingAdapterKind = "onchain" | "api";

export type RateSide = "supply" | "borrow";

export interface LendingActionRequest {
  chainId: number;
  /** ERC-20 reserve token; never the native token. */
  token: Address;
  /** "max" only reaches buildWithdraw (full balance) and buildRepay
   *  (full debt). */
  amount: bigint | "max";
  /** Connected account (msg.sender). */
  from: Address;
  /** Position owner; equals `from` unless --on-behalf-of. */
  onBehalfOf: Address;
  /** Withdraw recipient; equals `from` unless --to. */
  to: Address;
}

export interface LendingPlan {
  /** ERC-20 spender the auto-approve logic must fund (the pool). Undefined
   *  when the operation needs no allowance (withdraw, borrow...). */
  approvalTarget?: Address;
  /** Amount the approval must cover. */
  approvalAmount?: bigint;
  /** Actions to run after any auto-approve action. */
  actions: Action[];
}

export interface LendingAdapter {
  /** Canonical display name, e.g. "AaveV3". */
  name: string;
  kind: LendingAdapterKind;
  /** Static address-book check (sync so completions can use it). */
  supports(chainId: number): boolean;

  buildSupply(module: Lending, req: LendingActionRequest): Promise<LendingPlan>;
  buildWithdraw(
    module: Lending,
    req: LendingActionRequest,
  ): Promise<LendingPlan>;
  buildBorrow(module: Lending, req: LendingActionRequest): Promise<LendingPlan>;
  buildRepay(module: Lending, req: LendingActionRequest): Promise<LendingPlan>;
  /** Optional: Compound v3 manages collateral automatically. */
  buildSetCollateral?(
    module: Lending,
    req: { chainId: number; token: Address; enabled: boolean },
  ): Promise<LendingPlan>;
  /** Optional: not every protocol has e-mode (Compound v3 doesn't). */
  buildSetEmode?(
    module: Lending,
    req: { chainId: number; categoryId: number },
  ): Promise<LendingPlan>;

  /** Reads — optional so adapters without the concept (Compound v3 has no
   *  health factor) can omit them; helpers throw a clear error instead. */
  healthFactor?(
    module: Lending,
    chainId: number,
    account: Address,
  ): Promise<bigint>;
  /** APY as a plain decimal fraction (2.04% -> 0.0204). */
  apy?(
    module: Lending,
    chainId: number,
    token: Address,
    side: RateSide,
  ): Promise<number>;
  maxBorrow?(
    module: Lending,
    chainId: number,
    account: Address,
    token: Address,
  ): Promise<bigint>;
  debt?(
    module: Lending,
    chainId: number,
    account: Address,
    token: Address,
  ): Promise<bigint>;
}
