import type { Address } from "@evmcrispr/sdk";
import {
  fetchImplementationAddress,
  fetchVerifiedContract,
  type VerifiedContractInfo,
} from "@evmcrispr/sdk";
import type { Chain, PublicClient } from "viem";
import { formatEther, getAddress } from "viem";
import * as viemChains from "viem/chains";

import type { HoverInfo } from "./types";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface ChainData {
  raw?: `0x${string}`;
  balance?: bigint;
  txCount?: number;
  ensName?: string | null;
}

interface ContractExtras {
  implementation?: Address;
  /**
   * Verification metadata for the address itself. Only consulted when
   * the contract is *not* a proxy — proxy targets render the
   * implementation's verified data instead, since the proxy shell
   * (e.g. `TransparentUpgradeableProxy`) carries no information the user
   * cares about.
   */
  verified?: VerifiedContractInfo | null;
  implementationVerified?: VerifiedContractInfo | null;
}

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

function findChain(chainId: number | undefined): Chain | undefined {
  if (!chainId) return undefined;
  return Object.values(viemChains).find((c) => (c as Chain).id === chainId) as
    | Chain
    | undefined;
}

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

function codeSizeBytes(code: `0x${string}` | undefined): number {
  if (!code || code === "0x") return 0;
  // 2 hex chars per byte, minus the leading 0x.
  return (code.length - 2) / 2;
}

/**
 * EIP-7702 delegation designator: an EOA's code is set to exactly
 * `0xef0100 || <20-byte target address>` (23 bytes total). The account
 * stays an EOA but its execution is delegated to the target contract.
 *
 * Returns the delegation target when `code` matches the designator, else
 * `null`.
 */
function detectDelegation(code: `0x${string}` | undefined): Address | null {
  if (!code) return null;
  const hex = code.toLowerCase();
  if (hex.length !== 2 + 23 * 2) return null;
  if (!hex.startsWith("0xef0100")) return null;
  try {
    return getAddress(`0x${hex.slice(8)}`) as Address;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// On-chain fetch
// ---------------------------------------------------------------------------

async function fetchChainData(
  address: Address,
  client: PublicClient | undefined,
  chain: Chain | undefined,
): Promise<ChainData> {
  if (!client) return {};

  const ensSupported =
    !!chain?.contracts?.ensRegistry ||
    !!(chain?.contracts as { ensUniversalResolver?: unknown } | undefined)
      ?.ensUniversalResolver;

  const [code, balance, txCount, ensName] = await Promise.all([
    client.getCode({ address }).catch(() => undefined),
    client.getBalance({ address }).catch(() => undefined),
    client.getTransactionCount({ address }).catch(() => undefined),
    ensSupported
      ? client.getEnsName({ address }).catch(() => null)
      : Promise.resolve<string | null>(null),
  ]);

  return {
    raw: code,
    balance,
    txCount,
    ensName,
  };
}

async function fetchContractExtras(
  address: Address,
  client: PublicClient,
  chainId: number | undefined,
): Promise<ContractExtras> {
  const [implementation, verified] = await Promise.all([
    fetchImplementationAddress(address, client).catch(
      () => undefined as Address | undefined,
    ),
    chainId ? fetchVerifiedContract(chainId, address) : Promise.resolve(null),
  ]);

  let implementationVerified: VerifiedContractInfo | null = null;
  if (implementation && chainId) {
    implementationVerified = await fetchVerifiedContract(
      chainId,
      implementation,
    );
  }

  return {
    implementation,
    verified,
    implementationVerified,
  };
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
  address: Address,
  chain: Chain | undefined,
  chainId: number | undefined,
  data: ChainData,
): string {
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const lines: string[] = [];
  lines.push(renderHeader("EOA", chain, chainId, address));

  if (data.ensName) lines.push(`- ENS: \`${data.ensName}\``);
  if (data.balance !== undefined)
    lines.push(`- Balance: ${formatBalance(data.balance, symbol)}`);
  if (data.txCount !== undefined)
    lines.push(`- Tx count: ${formatNumber(data.txCount)}`);

  return lines.join("\n") + renderLinkLine(chain, address);
}

function renderDelegatedEoa(
  address: Address,
  chain: Chain | undefined,
  chainId: number | undefined,
  data: ChainData,
  delegate: Address,
  delegateVerified: VerifiedContractInfo | null,
): string {
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const lines: string[] = [];
  lines.push(renderHeader("Delegated EOA", chain, chainId, address));
  lines.push("*(EIP-7702 — execution delegated to a contract)*");
  lines.push("");

  if (data.ensName) lines.push(`- ENS: \`${data.ensName}\``);

  const delegateName = delegateVerified?.name
    ? ` (${delegateVerified.name})`
    : "";
  lines.push(`- Delegate: \`${shortAddress(delegate)}\`${delegateName}`);

  if (data.balance !== undefined)
    lines.push(`- Balance: ${formatBalance(data.balance, symbol)}`);
  if (data.txCount !== undefined)
    lines.push(`- Tx count: ${formatNumber(data.txCount)}`);

  let extra: { label: string; url: string } | undefined;
  const delegateUrl = explorerUrl(chain, delegate);
  if (delegateUrl) extra = { label: "Delegate", url: delegateUrl };

  return lines.join("\n") + renderLinkLine(chain, address, extra);
}

function renderContract(
  address: Address,
  chain: Chain | undefined,
  chainId: number | undefined,
  data: ChainData,
  extras: ContractExtras,
): string {
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const lines: string[] = [];
  lines.push(renderHeader("Contract", chain, chainId, address));

  if (data.ensName) lines.push(`- ENS: \`${data.ensName}\``);

  // For proxies, the user cares about the implementation — the proxy
  // shell itself (e.g. `TransparentUpgradeableProxy`) is just plumbing.
  // Pick the most relevant verification metadata accordingly, and
  // silently omit the Name row when nothing is known so we never display
  // a noisy `(unverified)` placeholder.
  const meta: VerifiedContractInfo | null = extras.implementation
    ? (extras.implementationVerified ?? null)
    : (extras.verified ?? null);

  if (meta) {
    const matchTag = meta.matchType === "partial" ? "  *(partial match)*" : "";
    const viaProxy = extras.implementation ? "  *(via proxy)*" : "";
    lines.push(`- Name: **${meta.name}**${viaProxy}${matchTag}`);
    if (meta.compilerVersion) {
      const optim = meta.optimizationUsed
        ? ` (optimizer, ${formatNumber(meta.runs)} runs)`
        : " (no optimizer)";
      lines.push(`- Compiler: ${meta.compilerVersion}${optim}`);
    }
    if (meta.license) lines.push(`- License: ${meta.license}`);
  }

  if (extras.implementation) {
    lines.push(`- Proxy: → \`${shortAddress(extras.implementation)}\``);
  }

  if (data.balance !== undefined)
    lines.push(`- Balance: ${formatBalance(data.balance, symbol)}`);

  const codeBytes = codeSizeBytes(data.raw);
  if (codeBytes > 0)
    lines.push(`- Code size: ${formatNumber(codeBytes)} bytes`);

  let extra: { label: string; url: string } | undefined;
  if (extras.implementation) {
    const implUrl = explorerUrl(chain, extras.implementation);
    if (implUrl) extra = { label: "Implementation", url: implUrl };
  }

  return lines.join("\n") + renderLinkLine(chain, address, extra);
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Build hover info for an Ethereum address using the active `PublicClient`
 * and Etherscan's verified-contract metadata.
 *
 * - EOAs (no code) get ENS / balance / tx-count.
 * - Contracts additionally show name, compiler, license, proxy target and
 *   code size.
 *
 * Network failures degrade gracefully: a row is simply omitted when its
 * source call fails, and the function returns at least the header card.
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
    const chain = findChain(chainId);
    const data = await fetchChainData(address, client, chain);
    const hasCode = !!data.raw && data.raw !== "0x";

    if (!hasCode) {
      return { contents: [renderEoa(address, chain, chainId, data)] };
    }

    // EIP-7702: account holds an `0xef0100 || target` designator. It's
    // still an EOA, just with execution delegated to `target`.
    const delegate = detectDelegation(data.raw);
    if (delegate) {
      const delegateVerified = chainId
        ? await fetchVerifiedContract(chainId, delegate).catch(() => null)
        : null;
      return {
        contents: [
          renderDelegatedEoa(
            address,
            chain,
            chainId,
            data,
            delegate,
            delegateVerified,
          ),
        ],
      };
    }

    if (!client) {
      return {
        contents: [renderContract(address, chain, chainId, data, {})],
      };
    }

    const extras = await fetchContractExtras(address, client, chainId);
    return {
      contents: [renderContract(address, chain, chainId, data, extras)],
    };
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
