import type { Address } from "viem";
import { formatUnits, parseAbiItem, zeroAddress } from "viem";
import type { Module } from "../Module";
import { viemChainById } from "./chains";

const decimalsAbi = parseAbiItem("function decimals() view returns (uint8)");
const symbolAbi = parseAbiItem("function symbol() view returns (string)");

const chainNames: Record<number, string> = {};

/** Human chain name for a chain id (e.g. 10 → "OP Mainnet"). */
export function chainLabel(chainId: number): string {
  chainNames[chainId] ??= viemChainById(chainId)?.name ?? `chain ${chainId}`;
  return chainNames[chainId];
}

// Display-only: any failure (no client, unreadable token) degrades to
// undefined so a formatter never masks the message it decorates.
async function tokenMeta(
  module: Module,
  token: Address,
): Promise<{ symbol: string; decimals: number } | undefined> {
  try {
    if (token === zeroAddress) {
      const chain = await module.getChain();
      return chain?.nativeCurrency ?? { symbol: "ETH", decimals: 18 };
    }
    const client = await module.getClient();
    const [decimals, symbol] = await Promise.all([
      client.readContract({
        address: token,
        abi: [decimalsAbi],
        functionName: "decimals",
      }),
      client.readContract({
        address: token,
        abi: [symbolAbi],
        functionName: "symbol",
      }),
    ]);
    return { symbol, decimals };
  } catch {
    return undefined;
  }
}

/**
 * Build a formatter that renders base-unit amounts of `token` as
 * human-readable strings with the token symbol (e.g. `0.72 USDC`), falling
 * back to raw base units + address when symbol/decimals are unreadable.
 */
export async function tokenAmountFormatter(
  module: Module,
  token: Address,
): Promise<(amount: bigint) => string> {
  const meta = await tokenMeta(module, token);
  return (amount) =>
    meta
      ? `${formatUnits(amount, meta.decimals)} ${meta.symbol}`
      : `${amount} of ${token}`;
}

/**
 * A token's symbol for logs and errors (the zero address renders as the
 * chain's native currency), falling back to the raw address when the
 * symbol is unreadable.
 */
export async function tokenLabel(
  module: Module,
  token: Address,
): Promise<string> {
  return (await tokenMeta(module, token))?.symbol ?? token;
}
