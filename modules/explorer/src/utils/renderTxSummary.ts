import type { Address, EnsResolver, Module } from "@evmcrispr/sdk";
import {
  fetchAbi,
  fetchVerifiedContract,
  findAbiFunctionBySelector,
  lookupFunctionSignature,
  makeEnsResolver,
  renderAbiValue,
  viemChainById,
} from "@evmcrispr/sdk";
import type { Abi, AbiEvent, AbiFunction, Log } from "viem";
import {
  decodeEventLog,
  decodeFunctionData,
  formatEther,
  getAddress,
  parseAbiItem,
  toFunctionSignature,
} from "viem";
import { computeFee, type TxContext } from "./txContext";

const MAX_LOGS = 10;

function formatNumber(n: number | bigint): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNative(wei: bigint, symbol: string): string {
  const ether = formatEther(wei);
  // Trim float noise but keep small fees meaningful.
  const [whole, frac = ""] = ether.split(".");
  const fracTrimmed = frac.replace(/0+$/, "").slice(0, 8);
  return fracTrimmed
    ? `${whole}.${fracTrimmed} ${symbol}`
    : `${whole} ${symbol}`;
}

function formatTimestamp(unixSeconds: bigint): string {
  const iso = new Date(Number(unixSeconds) * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/** `Name (0x1234…5678)` / `ens.eth (0x…)` / checksummed address. */
async function labelFor(
  address: Address,
  chainId: number,
  resolveEns: EnsResolver,
): Promise<string> {
  const checksummed = getAddress(address);
  const short = `${checksummed.slice(0, 6)}…${checksummed.slice(-4)}`;
  const verified = await fetchVerifiedContract(chainId, checksummed).catch(
    () => null,
  );
  if (verified?.name) return `${verified.name} (${short})`;
  const ens = await resolveEns(checksummed).catch(() => null);
  return ens ? `${ens} (${short})` : checksummed;
}

/** Per-summary ABI cache so multiple logs from one emitter fetch once. */
function makeAbiCache(ctx: TxContext) {
  const abis = new Map<string, Promise<Abi | null>>();
  return (address: Address): Promise<Abi | null> => {
    const key = getAddress(address);
    let entry = abis.get(key);
    if (!entry) {
      entry = fetchAbi(key, ctx.client)
        .then(([, abi]) => abi)
        .catch(() => null);
      abis.set(key, entry);
    }
    return entry;
  };
}

async function describeCall(
  ctx: TxContext,
  resolveEns: EnsResolver,
  getCachedAbi: (address: Address) => Promise<Abi | null>,
): Promise<string[]> {
  const { tx } = ctx;

  if (tx.to === null) {
    const created = ctx.receipt?.contractAddress;
    return [`Creates: ${created ? getAddress(created) : "(contract)"}`];
  }
  if (!tx.input || tx.input === "0x") {
    return ["Call: (plain value transfer, no calldata)"];
  }

  const selector = tx.input.slice(0, 10);

  let fnAbi: AbiFunction | undefined;
  const abi = await getCachedAbi(tx.to as Address);
  if (abi) fnAbi = findAbiFunctionBySelector(abi, selector);
  if (!fnAbi) {
    const signature = await lookupFunctionSignature(selector).catch(() => null);
    if (signature) {
      try {
        fnAbi = parseAbiItem(`function ${signature}`) as AbiFunction;
      } catch {
        fnAbi = undefined;
      }
    }
  }

  if (!fnAbi) {
    return [
      `Call: selector ${selector}, ${(tx.input.length - 2) / 2} bytes of calldata (undecoded)`,
    ];
  }

  try {
    const { args = [] } = decodeFunctionData({ abi: [fnAbi], data: tx.input });
    const rendered = await Promise.all(
      fnAbi.inputs.map(async (param, i) => {
        const value = await renderAbiValue(param, args[i], resolveEns);
        const flat = JSON.stringify(value).replace(/^"|"$/g, "");
        return `  ${param.name ?? i}: ${flat}`;
      }),
    );
    return [`Call: ${toFunctionSignature(fnAbi)}`, ...rendered];
  } catch {
    return [`Call: ${toFunctionSignature(fnAbi)} (args undecoded)`];
  }
}

async function describeLog(
  log: Log,
  resolveEns: EnsResolver,
  getCachedAbi: (address: Address) => Promise<Abi | null>,
): Promise<string> {
  const emitter = getAddress(log.address);
  const abi = await getCachedAbi(emitter);
  if (abi) {
    try {
      const decoded = decodeEventLog({
        abi,
        topics: log.topics,
        data: log.data,
        strict: false,
      });
      const eventAbi = abi.find(
        (e): e is AbiEvent =>
          e.type === "event" && e.name === decoded.eventName,
      );
      const namedArgs = decoded.args as Record<string, unknown> | undefined;
      const rendered = eventAbi
        ? await Promise.all(
            eventAbi.inputs.map(async (param, i) => {
              const raw = Array.isArray(namedArgs)
                ? namedArgs[i]
                : namedArgs?.[param.name ?? `${i}`];
              const value = await renderAbiValue(param, raw, resolveEns);
              const flat = JSON.stringify(value).replace(/^"|"$/g, "");
              return `${param.name ?? i}: ${flat}`;
            }),
          )
        : [];
      return `  ${decoded.eventName}(${rendered.join(", ")})`;
    } catch {
      /* fall through to the undecoded line */
    }
  }
  return `  ${log.topics[0] ?? "(no topic)"} at ${emitter} (undecoded)`;
}

/**
 * Multi-line human-readable summary of a transaction: status, labeled
 * from/to, value, decoded call, gas/fee and decoded logs. Every
 * enrichment (verified names, ENS, ABI decode) is best-effort — a
 * network miss degrades the line, never the summary.
 */
export async function renderTxSummary(
  module: Module,
  ctx: TxContext,
): Promise<string> {
  const chain = viemChainById(ctx.chainId);
  const symbol = chain?.nativeCurrency.symbol ?? "ETH";
  const chainName = chain?.name ?? `chain ${ctx.chainId}`;
  const resolveEns = makeEnsResolver(module);
  const getCachedAbi = makeAbiCache(ctx);

  const lines: string[] = [];

  const { tx, receipt } = ctx;
  if (!receipt) {
    lines.push(`Pending — ${chainName} (${ctx.chainId})`);
  } else {
    const status = receipt.status === "success" ? "Success" : "Reverted";
    const timestamp = await ctx
      .getBlock()
      .then((b) => ` (${formatTimestamp(b.timestamp)})`)
      .catch(() => "");
    lines.push(
      `${status} — ${chainName} (${ctx.chainId}), block ${receipt.blockNumber}${timestamp}`,
    );
  }

  const [fromLabel, toLabel] = await Promise.all([
    labelFor(tx.from as Address, ctx.chainId, resolveEns),
    tx.to
      ? labelFor(tx.to as Address, ctx.chainId, resolveEns)
      : Promise.resolve(null),
  ]);
  lines.push(`From: ${fromLabel}`);
  if (toLabel) lines.push(`To:   ${toLabel}`);

  if (tx.value > 0n) lines.push(`Value: ${formatNative(tx.value, symbol)}`);

  lines.push(...(await describeCall(ctx, resolveEns, getCachedAbi)));

  if (receipt) {
    lines.push(
      `Gas: ${formatNumber(receipt.gasUsed)} used — fee ${formatNative(computeFee(receipt), symbol)}`,
    );

    if (receipt.logs.length > 0) {
      lines.push(`Logs (${receipt.logs.length}):`);
      const shown = receipt.logs.slice(0, MAX_LOGS);
      const rendered = await Promise.all(
        shown.map((log) => describeLog(log, resolveEns, getCachedAbi)),
      );
      lines.push(...rendered);
      if (receipt.logs.length > MAX_LOGS) {
        lines.push(`  … and ${receipt.logs.length - MAX_LOGS} more`);
      }
    }
  }

  return lines.join("\n");
}
