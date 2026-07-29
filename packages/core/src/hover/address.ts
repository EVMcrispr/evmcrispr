import type { Address } from "@evmcrispr/sdk";
import {
  type AddressInfo,
  classifyAddress,
  type VerifiedContractInfo,
  viemChainById,
} from "@evmcrispr/sdk";
import type { Chain, PublicClient } from "viem";
import { formatEther, getAddress } from "viem";

import type { HoverInfo } from "./types";

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

const ADDRESS_TTL_MS = 30 * 1000;
const ADDRESS_MAX = 100;
const addressCache = new Map<
  string,
  { expires: number; value: HoverInfo | null }
>();
const addressInflight = new Map<string, Promise<HoverInfo | null>>();

const addressKey = (chainId: number | undefined, address: Address) =>
  `${chainId ?? "?"}:${getAddress(address)}`;

function readAddrCache(key: string): HoverInfo | null | undefined {
  const entry = addressCache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    addressCache.delete(key);
    return undefined;
  }
  addressCache.delete(key);
  addressCache.set(key, entry);
  return entry.value;
}

function writeAddrCache(key: string, value: HoverInfo | null): void {
  if (addressCache.size >= ADDRESS_MAX) {
    const oldest = addressCache.keys().next().value;
    if (oldest) addressCache.delete(oldest);
  }
  addressCache.set(key, { expires: Date.now() + ADDRESS_TTL_MS, value });
}

/** Test-only: drop the in-memory address hover cache. */
export function clearAddressHoverCache(): void {
  addressCache.clear();
  addressInflight.clear();
}

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------

function explorerUrl(
  chain: Chain | undefined,
  address: Address,
): string | undefined {
  const explorer = chain?.blockExplorers?.default;
  if (!explorer?.url) return undefined;
  return `${explorer.url.replace(/\/$/, "")}/address/${getAddress(address)}`;
}

function chainLabel(
  chain: Chain | undefined,
  chainId: number | undefined,
): string {
  if (chain) return `${chain.name} (chainId ${chain.id})`;
  if (chainId) return `chainId ${chainId}`;
  return "unknown chain";
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatBalance(wei: bigint, symbol: string): string {
  const ether = formatEther(wei);
  const [whole, frac = ""] = ether.split(".");
  const wholeWithCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracTrimmed = frac.replace(/0+$/, "").slice(0, 6);
  return fracTrimmed.length > 0
    ? `${wholeWithCommas}.${fracTrimmed} ${symbol}`
    : `${wholeWithCommas} ${symbol}`;
}

function formatNumber(n: number | bigint): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderHeader(
  kind: "EOA" | "Delegated EOA" | "Contract",
  chain: Chain | undefined,
  chainId: number | undefined,
  address: Address,
): string {
  return [
    `**${kind}** — ${chainLabel(chain, chainId)}`,
    "",
    `\`${getAddress(address)}\``,
    "",
  ].join("\n");
}

function renderLinkLine(
  chain: Chain | undefined,
  address: Address,
  extra?: { label: string; url: string },
): string {
  const parts: string[] = [];
  const explorer = explorerUrl(chain, address);
  if (explorer) {
    const name = chain?.blockExplorers?.default?.name ?? "Explorer";
    parts.push(`[${name} ↗](${explorer})`);
  }
  if (extra) parts.push(`[${extra.label} ↗](${extra.url})`);
  if (parts.length === 0) return "";
  return `\n${parts.join(" · ")}`;
}

function renderEoa(
  chain: Chain | undefined,
  chainId: number | undefined,
  info: AddressInfo,
): string {
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const lines: string[] = [];
  lines.push(renderHeader("EOA", chain, chainId, info.address));

  if (info.ensName) lines.push(`- ENS: \`${info.ensName}\``);
  if (info.balance !== undefined)
    lines.push(`- Balance: ${formatBalance(info.balance, symbol)}`);
  if (info.txCount !== undefined)
    lines.push(`- Tx count: ${formatNumber(info.txCount)}`);

  return lines.join("\n") + renderLinkLine(chain, info.address);
}

function renderDelegatedEoa(
  chain: Chain | undefined,
  chainId: number | undefined,
  info: AddressInfo,
  delegate: Address,
): string {
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const lines: string[] = [];
  lines.push(renderHeader("Delegated EOA", chain, chainId, info.address));
  lines.push("*(EIP-7702 — execution delegated to a contract)*");
  lines.push("");

  if (info.ensName) lines.push(`- ENS: \`${info.ensName}\``);

  const delegateName = info.delegateVerified?.name
    ? ` (${info.delegateVerified.name})`
    : "";
  lines.push(`- Delegate: \`${shortAddress(delegate)}\`${delegateName}`);

  if (info.balance !== undefined)
    lines.push(`- Balance: ${formatBalance(info.balance, symbol)}`);
  if (info.txCount !== undefined)
    lines.push(`- Tx count: ${formatNumber(info.txCount)}`);

  let extra: { label: string; url: string } | undefined;
  const delegateUrl = explorerUrl(chain, delegate);
  if (delegateUrl) extra = { label: "Delegate", url: delegateUrl };

  return lines.join("\n") + renderLinkLine(chain, info.address, extra);
}

function renderContract(
  chain: Chain | undefined,
  chainId: number | undefined,
  info: AddressInfo,
): string {
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const lines: string[] = [];
  lines.push(renderHeader("Contract", chain, chainId, info.address));

  if (info.ensName) lines.push(`- ENS: \`${info.ensName}\``);

  // For proxies, the user cares about the implementation — the proxy
  // shell itself (e.g. `TransparentUpgradeableProxy`) is just plumbing.
  // Pick the most relevant verification metadata accordingly, and
  // silently omit the Name row when nothing is known so we never display
  // a noisy `(unverified)` placeholder.
  const meta: VerifiedContractInfo | null = info.implementation
    ? (info.implementationVerified ?? null)
    : (info.verified ?? null);

  if (meta) {
    const matchTag = meta.matchType === "partial" ? "  *(partial match)*" : "";
    const viaProxy = info.implementation ? "  *(via proxy)*" : "";
    lines.push(`- Name: **${meta.name}**${viaProxy}${matchTag}`);
    if (meta.compilerVersion) {
      const optim = meta.optimizationUsed
        ? ` (optimizer, ${formatNumber(meta.runs)} runs)`
        : " (no optimizer)";
      lines.push(`- Compiler: ${meta.compilerVersion}${optim}`);
    }
    if (meta.license) lines.push(`- License: ${meta.license}`);
  }

  if (info.implementation) {
    lines.push(`- Proxy: → \`${shortAddress(info.implementation)}\``);
  }

  if (info.balance !== undefined)
    lines.push(`- Balance: ${formatBalance(info.balance, symbol)}`);

  if (info.codeSize > 0)
    lines.push(`- Code size: ${formatNumber(info.codeSize)} bytes`);

  let extra: { label: string; url: string } | undefined;
  if (info.implementation) {
    const implUrl = explorerUrl(chain, info.implementation);
    if (implUrl) extra = { label: "Implementation", url: implUrl };
  }

  return lines.join("\n") + renderLinkLine(chain, info.address, extra);
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Build hover info for an Ethereum address using the active `PublicClient`
 * and verified-contract metadata (Etherscan, falling back to Blockscout).
 *
 * - EOAs (no code) get ENS / balance / tx-count.
 * - Contracts additionally show name, compiler, license, proxy target and
 *   code size.
 *
 * Network failures degrade gracefully: a row is simply omitted when its
 * source call fails, and the function returns at least the header card.
 * The classification itself lives in the sdk (`classifyAddress`); this
 * module only caches and renders it as hover markdown.
 */
export async function getAddressHoverInfo(
  rawAddress: Address,
  client: PublicClient | undefined,
  chainId: number | undefined,
): Promise<HoverInfo | null> {
  let address: Address;
  try {
    address = getAddress(rawAddress);
  } catch {
    return null;
  }

  const key = addressKey(chainId, address);
  const cached = readAddrCache(key);
  if (cached !== undefined) return cached;

  const inflight = addressInflight.get(key);
  if (inflight) return inflight;

  const promise = (async (): Promise<HoverInfo | null> => {
    const chain = viemChainById(chainId);
    const info = await classifyAddress(address, client, chainId);
    if (!info) return null;

    const rendered =
      info.kind === "eoa"
        ? renderEoa(chain, chainId, info)
        : info.kind === "delegated-eoa"
          ? renderDelegatedEoa(chain, chainId, info, info.delegate as Address)
          : renderContract(chain, chainId, info);
    return { contents: [rendered] };
  })();

  addressInflight.set(key, promise);
  try {
    const value = await promise;
    writeAddrCache(key, value);
    return value;
  } finally {
    addressInflight.delete(key);
  }
}
