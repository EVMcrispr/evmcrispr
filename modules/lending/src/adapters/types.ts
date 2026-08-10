import type { Action } from "@evmcrispr/sdk";
import type { CompileCtx, Operand } from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import type Lending from "..";

/** An exact fractional rate: `value` divided by 10^`scale`. */
export interface ScaledRate {
  value: bigint;
  scale: number;
}

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
  /** The on-chain form of {@link healthFactor}, wad-scaled like the read. */
  compileHealthFactor?(
    ctx: CompileCtx,
    module: Lending,
    chainId: number,
    account: Operand,
  ): Promise<Operand>;
  /**
   * APY as a scaled integer: the word times 10^-scale is the fraction
   * (2.04% is 204e23 at scale 27). Scaled rather than a decimal so the
   * value is exact and so it agrees with {@link compileApy}, which has
   * only words to work with.
   */
  apy?(
    module: Lending,
    chainId: number,
    token: Address,
    side: RateSide,
  ): Promise<ScaledRate>;
  /**
   * The on-chain form of {@link apy}: the same rate as an expression
   * evaluated at assertion time. Optional independently of `apy`, because
   * an adapter can be readable off-chain and still have no expressible
   * form — an unbounded loop over collateral assets has no composition,
   * and saying so beats a face that quietly means something else.
   */
  compileApy?(
    ctx: CompileCtx,
    module: Lending,
    chainId: number,
    token: Address,
    side: RateSide,
  ): Promise<Operand>;
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
  /** The on-chain form of {@link debt}, in the token's base units. */
  compileDebt?(
    ctx: CompileCtx,
    module: Lending,
    chainId: number,
    account: Operand,
    token: Address,
  ): Promise<Operand>;
}
