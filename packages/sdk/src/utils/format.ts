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

/** Short form of an address for messages (e.g. "0x4f4F...9e75"). */
export function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
  { compact = false }: { compact?: boolean } = {},
): Promise<(amount: bigint) => string> {
  const meta = await tokenMeta(module, token);
  return (amount) => {
    if (!meta) return `${amount} of ${token}`;
    const value = formatUnits(amount, meta.decimals);
    return `${compact ? compactAmount(value) : value} ${meta.symbol}`;
  };
}

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const fraction = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 4,
});

/** A decimal amount for reading, not for arithmetic: at most 4 decimals
 *  (with thousands separators) from 1 up, 4 significant digits below 1.
 *  "1234.56789" → "1,234.5679", "0.000369077182443993" → "0.0003691". */
export function compactAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return (Math.abs(n) >= 1 ? whole : fraction).format(n);
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
