import {
  type Action,
  ErrorException,
  type ModuleActionSimCtx,
} from "@evmcrispr/sdk";
import type { Transport } from "viem";
import { keccak256, toHex } from "viem";

export interface SimBackendOpts {
  upstreamRpcUrl: string;
  blockNumber?: number;
  chainId: number;
  /** Aborts in-flight upstream RPC fetches when the run is cancelled. */
  signal?: AbortSignal;
}

/**
 * Minimal receipt for a transaction executed by an in-process backend — enough
 * for event captures and the fork's cross-chain relay scanner.
 */
export interface SyntheticReceipt {
  status: "success";
  blockNumber: bigint;
  /** Deterministic pseudo-hash of the simulated transaction. Nothing is
   * broadcast in-process, so this is an opaque identifier for tx captures
   * (`> $var`) — it does not resolve on any RPC. */
  transactionHash: `0x${string}`;
  /** The contract a deployment created. */
  contractAddress?: `0x${string}`;
  /** Gas the transaction used, as far as the backend can tell. Nothing is
   * charged for it in-process; it is what a fee is estimated from. */
  gasUsed?: bigint;
  logs: {
    address: `0x${string}`;
    topics: `0x${string}`[];
    data: `0x${string}`;
    logIndex: number;
  }[];
  /** Every account whose balance of the chain's own currency the
   *  transaction changed, read from the backend's state changes: value
   *  sent by any call at any depth, a selfdestruct, a fee. */
  balanceChanges?: BalanceChange[];
}

/** One account's native balance before and after a transaction. */
export interface BalanceChange {
  address: `0x${string}`;
  before: bigint;
  after: bigint;
}

/**
 * Contract for in-process simulation backends (ethereumjs, revm): a viem
 * transport for the read path and an action handler for the write path.
 */
export interface SimBackend {
  transport: Transport;
  handleAction(action: Action): Promise<SyntheticReceipt | undefined>;
  /** What a module action's `simulate` runs on (its calls, checkpoints and
   *  added opcodes). */
  simContext?(
    action: Action,
    host: { onLog: (message: string) => void },
  ): ModuleActionSimCtx;
}

/** A stalled upstream (rate limiter that never responds, dead connection)
 *  would otherwise hang the simulation forever. */
export const RPC_TIMEOUT_MS = 30_000;

/**
 * JSON-RPC fetch that surfaces `error` responses — @ethereumjs/util's
 * fetchFromProvider returns `json.result` without checking `json.error`,
 * turning upstream RPC failures into cryptic undefined-dereference
 * TypeErrors deep inside the VM.
 */
export async function rpcFetch(
  url: string,
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<any> {
  const timeout = AbortSignal.timeout(RPC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new ErrorException("Execution cancelled");
    }
    if (timeout.aborted) {
      throw new ErrorException(
        `upstream RPC timed out after ${RPC_TIMEOUT_MS / 1000}s for ${method}`,
      );
    }
    throw err;
  }
  if (!res.ok) {
    throw new ErrorException(
      `upstream RPC returned HTTP ${res.status} for ${method}`,
    );
  }
  const json = await res.json();
  if (json.error) {
    throw new ErrorException(
      `upstream RPC rejected ${method}: ${json.error.message} (code ${json.error.code})`,
    );
  }
  return json.result;
}

export function padToBytes32(input: Uint8Array): Uint8Array {
  if (input.length === 32) return input;
  const padded = new Uint8Array(32);
  padded.set(input, 32 - input.length);
  return padded;
}

export async function resolveLatestBlockNumber(
  rpcUrl: string,
  signal?: AbortSignal,
): Promise<bigint> {
  const result = await rpcFetch(rpcUrl, "eth_blockNumber", [], signal);
  return BigInt(result);
}

/** An upstream that is itself a fork node (anvil mid-reset, a lagging
 *  load-balanced RPC) can report a head it cannot serve yet; give it a
 *  few seconds before treating the block as missing. */
const BLOCK_FETCH_ATTEMPTS = 5;
const BLOCK_FETCH_RETRY_MS = 1_500;

/** What a fork's block environment takes from the forked block. */
export interface ForkBlock {
  timestamp: bigint;
  /** 0 before London: what a transaction that gives fees pays at least. */
  baseFee: bigint;
  /** GASLIMIT. Transactions are not capped by it in a fork. */
  gasLimit: bigint;
  /** PREVRANDAO: the block's mixHash (zero before the merge). */
  prevRandao: `0x${string}`;
  /** BLOBBASEFEE, as the chain prices it (its own blob schedule), and the
   *  excess blob gas it comes from; 1 and 0 on a chain without blobs. */
  blobBaseFee: bigint;
  excessBlobGas: bigint;
}

const ZERO_WORD = `0x${"00".repeat(32)}` as const;

/** The forked block's environment: its timestamp, base fee, gas limit,
 *  mixHash and blob base fee. */
export async function fetchForkBlock(
  rpcUrl: string,
  blockNumber: bigint,
  signal?: AbortSignal,
): Promise<ForkBlock> {
  const tag = `0x${blockNumber.toString(16)}`;
  for (let attempt = 1; ; attempt++) {
    const block = await rpcFetch(
      rpcUrl,
      "eth_getBlockByNumber",
      [tag, false],
      signal,
    );
    if (block != null) {
      // The chain's own price for the block's blobs (a chain's schedule
      // can differ from mainnet's): the block's own, the first of the two.
      const history = await rpcFetch(
        rpcUrl,
        "eth_feeHistory",
        ["0x1", tag, []],
        signal,
      ).catch(() => undefined);
      const blobFee = history?.baseFeePerBlobGas?.[0];
      return {
        timestamp: BigInt(block.timestamp),
        baseFee: block.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n,
        gasLimit: BigInt(block.gasLimit ?? 30_000_000),
        prevRandao: (block.mixHash as `0x${string}` | undefined) ?? ZERO_WORD,
        blobBaseFee: blobFee && BigInt(blobFee) > 0n ? BigInt(blobFee) : 1n,
        excessBlobGas: block.excessBlobGas ? BigInt(block.excessBlobGas) : 0n,
      };
    }
    if (attempt >= BLOCK_FETCH_ATTEMPTS) {
      throw new ErrorException(
        `Block ${blockNumber} not found on upstream RPC (${rpcUrl}). ` +
          `The RPC may not serve this block or may be rate-limiting requests.`,
      );
    }
    await new Promise((r) => setTimeout(r, BLOCK_FETCH_RETRY_MS));
    if (signal?.aborted) throw new ErrorException("Execution cancelled");
  }
}

/**
 * Pseudo transaction hash for an in-process execution: keccak of the
 * action fields plus a per-run counter, so repeated identical actions in
 * one simulation still get distinct hashes.
 */
export function syntheticTxHash(
  action: Action,
  counter: number,
): `0x${string}` {
  const a = action as {
    from?: string;
    to?: string;
    data?: string;
    value?: bigint;
  };
  return keccak256(
    toHex(
      JSON.stringify(
        {
          from: a.from,
          to: a.to,
          data: a.data,
          value: a.value !== undefined ? String(a.value) : undefined,
          // A module action's own fields (bigints included).
          data_:
            (a as { type?: string }).type === "module"
              ? (action as { data?: unknown }).data
              : undefined,
          counter,
        },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
    ),
  );
}
