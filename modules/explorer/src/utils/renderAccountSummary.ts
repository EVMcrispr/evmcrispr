import type { AddressInfo, VerifiedContractInfo } from "@evmcrispr/sdk";
import { chainLabel, viemChainById } from "@evmcrispr/sdk";
import { formatEther, getAddress } from "viem";

function formatNumber(n: number | bigint): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNative(wei: bigint, symbol: string): string {
  const ether = formatEther(wei);
  const [whole, frac = ""] = ether.split(".");
  const fracTrimmed = frac.replace(/0+$/, "").slice(0, 6);
  return fracTrimmed
    ? `${whole}.${fracTrimmed} ${symbol}`
    : `${whole} ${symbol}`;
}

/**
 * Plain-text summary of a classified address, mirroring the editor's
 * hover card but without markdown so it prints cleanly in scripts and
 * chat.
 */
export function renderAccountSummary(
  info: AddressInfo,
  chainId: number,
): string {
  const chain = viemChainById(chainId);
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const chainName = chainLabel(chainId);
  const lines: string[] = [];

  const kindLabel =
    info.kind === "eoa"
      ? "EOA"
      : info.kind === "delegated-eoa"
        ? "EOA (EIP-7702 delegated)"
        : "Contract";
  lines.push(`${kindLabel} — ${chainName} (${chainId})`);
  lines.push(getAddress(info.address));

  if (info.ensName) lines.push(`ENS: ${info.ensName}`);

  if (info.kind === "delegated-eoa" && info.delegate) {
    const delegateName = info.delegateVerified?.name
      ? ` (${info.delegateVerified.name})`
      : "";
    lines.push(`Delegate: ${info.delegate}${delegateName}`);
  }

  if (info.kind === "contract") {
    // Proxies report the implementation's metadata — the shell name
    // (e.g. `TransparentUpgradeableProxy`) is just plumbing.
    const meta: VerifiedContractInfo | null = info.implementation
      ? (info.implementationVerified ?? null)
      : (info.verified ?? null);
    if (meta) {
      const viaProxy = info.implementation ? " (via proxy)" : "";
      lines.push(`Name: ${meta.name}${viaProxy}`);
      if (meta.compilerVersion) {
        const optim = meta.optimizationUsed
          ? ` (optimizer, ${formatNumber(meta.runs)} runs)`
          : " (no optimizer)";
        lines.push(`Compiler: ${meta.compilerVersion}${optim}`);
      }
      if (meta.license) lines.push(`License: ${meta.license}`);
    }
    if (info.implementation) lines.push(`Proxy -> ${info.implementation}`);
    if (info.codeSize > 0)
      lines.push(`Code size: ${formatNumber(info.codeSize)} bytes`);
  }

  if (info.balance !== undefined)
    lines.push(`Balance: ${formatNative(info.balance, symbol)}`);
  if (info.txCount !== undefined)
    lines.push(`Tx count: ${formatNumber(info.txCount)}`);

  return lines.join("\n");
}
