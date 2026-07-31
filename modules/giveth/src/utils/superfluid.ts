import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorException, Num, tokenLabel } from "@evmcrispr/sdk";
import type { Abi, Address } from "viem";
import { getAddress, parseAbi, zeroAddress } from "viem";

// Minimal Superfluid surface for recurring donations. Deliberately
// self-contained: the superfluid module package exports only its module
// class, and modules stay decoupled by re-deriving the small pieces they
// need (same pattern as utils/approval.ts).

/** CFAv1Forwarder — same address on every chain Giveth supports. */
export const CFA_FORWARDER: Address =
  "0xcfA132E353cB4E398080B9700609bb008eceB125";

export const cfaForwarderAbi = parseAbi([
  "function getFlowrate(address token, address sender, address receiver) view returns (int96)",
  "function getBufferAmountByFlowrate(address token, int96 flowrate) view returns (uint256)",
]);

export const superTokenAbi = parseAbi([
  "function getUnderlyingToken() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
]);

export const erc20MetaAbi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

/** Largest int96 value — CFA flow rates are int96 wei/second. */
export const INT96_MAX = 2n ** 95n - 1n;

/**
 * Native-asset SuperTokens (ETHx-style) for the chains where Giveth anchor
 * contracts exist, plus Gnosis for the test fork. Wrapping these uses
 * payable upgradeByETH; getUnderlyingToken() is unreliable for them.
 */
export const NATIVE_SUPERTOKEN: Record<number, Address> = {
  10: "0x4ac8bD1bDaE47beeF2D1c6Aa62229509b962Aa0d", // ETHx
  100: "0x59988e47A3503AaFaA0368b9deF095c818Fdca01", // xDAIx
  8453: "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93", // ETHx
};

export const SUPERFLUID_TOKENLIST_URL =
  "https://tokenlist.superfluid.org/superfluid.extended.tokenlist.json";

interface TokenListEntry {
  symbol: string;
  chainId: number;
  address: string;
  extensions?: {
    superTokenInfo?: {
      type: "Wrapper" | "Native Asset" | "Pure";
      underlyingTokenAddress?: string;
    };
  };
}

async function fetchSuperTokens(chainId: number): Promise<TokenListEntry[]> {
  const { tokens }: { tokens: TokenListEntry[] } = await fetch(
    SUPERFLUID_TOKENLIST_URL,
  ).then((r) => r.json());
  return tokens.filter(
    (t) => t.chainId === chainId && t.extensions?.superTokenInfo !== undefined,
  );
}

export interface ResolvedSuperToken {
  superToken: Address;
  /** Zero address for native-asset SuperTokens. */
  underlying: Address;
  native: boolean;
}

/**
 * Resolve the `<token>` arg — an underlying token (zero address = native),
 * or a SuperToken directly — to the SuperToken the flow streams and the
 * underlying whose symbol Giveth's database keys recurring donations on.
 */
export async function resolveDonationSuperToken(
  module: Module,
  token: Address,
): Promise<ResolvedSuperToken> {
  const chainId = await module.getChainId();

  const nativeSuper = NATIVE_SUPERTOKEN[chainId];
  if (token === zeroAddress) {
    if (!nativeSuper) {
      throw new ErrorException(
        `no native SuperToken is known on ${chainLabel(chainId)}`,
      );
    }
    return { superToken: nativeSuper, underlying: zeroAddress, native: true };
  }
  if (nativeSuper && getAddress(token) === getAddress(nativeSuper)) {
    return { superToken: nativeSuper, underlying: zeroAddress, native: true };
  }

  const given = getAddress(token);

  // A SuperToken identifies itself on-chain (pure SuperTokens report the
  // zero address and stream as their own currency), so no token list is
  // needed for direct SuperToken inputs.
  const client = await module.getClient();
  try {
    const underlying = (await client.readContract({
      address: given,
      abi: superTokenAbi as Abi,
      functionName: "getUnderlyingToken",
    })) as Address;
    return {
      superToken: given,
      underlying: underlying === zeroAddress ? given : getAddress(underlying),
      native: false,
    };
  } catch {
    // Not a SuperToken — treat it as an underlying and look its wrapper up.
  }

  const entries = await fetchSuperTokens(chainId);
  const asUnderlying = entries.find(
    (t) =>
      t.extensions?.superTokenInfo?.underlyingTokenAddress !== undefined &&
      getAddress(t.extensions.superTokenInfo.underlyingTokenAddress) === given,
  );
  if (asUnderlying) {
    return {
      superToken: getAddress(asUnderlying.address),
      underlying: given,
      native: false,
    };
  }

  throw new ErrorException(
    `${await tokenLabel(module, token)} is neither a SuperToken nor a token with a SuperToken wrapper on ${chainLabel(chainId)}`,
  );
}

/** The symbol Giveth's database keys the recurring donation on. */
export async function donationCurrency(
  module: Module,
  resolved: ResolvedSuperToken,
): Promise<string> {
  if (resolved.native) {
    const chain = await module.getChain();
    return chain?.nativeCurrency?.symbol ?? "ETH";
  }
  const client = await module.getClient();
  return (await client.readContract({
    address: resolved.underlying,
    abi: erc20MetaAbi as Abi,
    functionName: "symbol",
  })) as string;
}

/**
 * Scale an underlying-token amount to the SuperToken's 18-decimal
 * representation (SuperTokens are always 18 decimals; USDC is 6).
 */
export async function toSuperTokenAmount(
  module: Module,
  underlying: Address,
  amount: bigint,
): Promise<bigint> {
  const client = await module.getClient();
  const decimals = (await client.readContract({
    address: underlying,
    abi: erc20MetaAbi as Abi,
    functionName: "decimals",
  })) as number;
  if (decimals > 18) {
    throw new ErrorException(
      `tokens with more than 18 decimals are not supported (got ${decimals})`,
    );
  }
  return amount * 10n ** BigInt(18 - decimals);
}

/** Current flow rate from `sender` to `receiver`, in wei/second. */
export async function getFlowrate(
  module: Module,
  superToken: Address,
  sender: Address,
  receiver: Address,
): Promise<bigint> {
  const client = await module.getClient();
  return (await client.readContract({
    address: CFA_FORWARDER,
    abi: cfaForwarderAbi as Abi,
    functionName: "getFlowrate",
    args: [superToken, sender, receiver],
  })) as bigint;
}

/**
 * Parse a flow rate in wei/second where `0` is meaningful (stop). Rate
 * literals like `100e18/mo` arrive as exact rationals; flooring happens
 * only here, at encode time.
 */
export function parseFlowRateOrZero(value: unknown): bigint {
  let rate: bigint;
  try {
    rate = Num(value as string).toBigInt();
  } catch {
    throw new ErrorException(
      `<rate> must be a flow rate in wei per second — use a rate literal like 100e18/mo, got ${value}`,
    );
  }
  if (rate < 0n) {
    throw new ErrorException("<rate> must not be negative");
  }
  if (rate === 0n && Num(value as string).gt(Num(0n))) {
    throw new ErrorException(
      "<rate> must not floor to zero — a tiny rate like 1/y is 0 wei/second",
    );
  }
  if (rate > INT96_MAX) {
    throw new ErrorException("<rate> exceeds the maximum flow rate (int96)");
  }
  return rate;
}
