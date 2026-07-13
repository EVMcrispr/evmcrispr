import type { Module } from "@evmcrispr/sdk";
import { BindingsSpace, ErrorException } from "@evmcrispr/sdk";
import type { Abi, Address } from "viem";
import { getAddress, isAddress, zeroAddress } from "viem";
import { erc20Abi, superTokenAbi } from "../abis";
import { NATIVE_SUPERTOKEN, SUPERFLUID_TOKENLIST_URL } from "../addresses";

export const ENV_TOKENLIST = "$superfluid.tokenlist";

export interface SuperTokenEntry {
  symbol: string;
  name: string;
  chainId: number;
  address: string;
  extensions?: {
    superTokenInfo?: {
      type: "Wrapper" | "Native Asset" | "Pure";
      underlyingTokenAddress?: string;
    };
  };
}

export function tokenListUrl(module: Module): string {
  const url = String(
    module.bindingsManager.getBindingValue(ENV_TOKENLIST, BindingsSpace.USER) ??
      SUPERFLUID_TOKENLIST_URL,
  );
  if (!url.startsWith("https://")) {
    throw new ErrorException(
      `${ENV_TOKENLIST} must be a valid HTTPS URL, got ${url}`,
    );
  }
  return url;
}

export async function fetchSuperTokens(
  module: Module,
  chainId: number,
): Promise<SuperTokenEntry[]> {
  const url = tokenListUrl(module);
  const { tokens }: { tokens: SuperTokenEntry[] } = await fetch(url).then((r) =>
    r.json(),
  );
  return tokens.filter(
    (t) => t.chainId === chainId && t.extensions?.superTokenInfo !== undefined,
  );
}

/**
 * Resolve a `supertoken`-typed arg to a SuperToken address: an address
 * passes through, a symbol (USDCx, xDAIx, …) is looked up in the Superfluid
 * token list for the current chain.
 */
export async function resolveSuperToken(
  module: Module,
  symbolOrAddress: string,
): Promise<Address> {
  if (isAddress(symbolOrAddress)) return symbolOrAddress;

  // SYMBOL:0xAddress disambiguation, same convention as @token(...)
  const colonIdx = symbolOrAddress.lastIndexOf(":");
  if (colonIdx !== -1) {
    const addr = symbolOrAddress.slice(colonIdx + 1);
    if (isAddress(addr)) return getAddress(addr);
  }

  const chainId = await module.getChainId();
  const tokens = await fetchSuperTokens(module, chainId);
  const entry = tokens.find((t) => t.symbol === symbolOrAddress);
  if (!entry || !isAddress(entry.address)) {
    throw new ErrorException(
      `SuperToken ${symbolOrAddress} not found in ${tokenListUrl(module)} for chain ${chainId}`,
    );
  }
  return getAddress(entry.address);
}

/** Underlying ERC-20 of a SuperToken; zero address for native-asset SuperTokens (ETHx, xDAIx). */
export async function getUnderlyingToken(
  module: Module,
  superToken: Address,
): Promise<Address> {
  const client = await module.getClient();
  try {
    return (await client.readContract({
      address: superToken,
      abi: superTokenAbi as Abi,
      functionName: "getUnderlyingToken",
    })) as Address;
  } catch {
    throw new ErrorException(
      `${superToken} does not look like a SuperToken (getUnderlyingToken() reverted)`,
    );
  }
}

/**
 * Whether a SuperToken is the chain's native-asset SuperToken (ETHx,
 * xDAIx, …), which wraps via payable upgradeByETH instead of an ERC-20
 * pull. Detected against the metadata nativeTokenWrapper — NOT via
 * getUnderlyingToken(), which returns WXDAI-style wrapped natives on some
 * chains (Gnosis xDAIx) and the zero address on others.
 */
export function isNativeSuperToken(
  chainId: number,
  superToken: Address,
): boolean {
  const native = NATIVE_SUPERTOKEN[chainId];
  return native !== undefined && getAddress(native) === getAddress(superToken);
}

/** Pure SuperTokens have no underlying to wrap or unwrap. */
export function isPureSuperToken(underlying: Address): boolean {
  return underlying === zeroAddress;
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
    abi: erc20Abi as Abi,
    functionName: "decimals",
  })) as number;
  if (decimals > 18) {
    throw new ErrorException(
      `tokens with more than 18 decimals are not supported (got ${decimals})`,
    );
  }
  return amount * 10n ** BigInt(18 - decimals);
}
