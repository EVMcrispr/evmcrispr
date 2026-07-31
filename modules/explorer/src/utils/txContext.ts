import type { Param } from "@evmcrispr/sdk";
import {
  assertTxHash,
  chainLabel,
  clientFor,
  ErrorException,
  type Module,
  resolveChainId,
} from "@evmcrispr/sdk";
import type {
  Block,
  Hex,
  PublicClient,
  Transaction,
  TransactionReceipt,
} from "viem";

export interface TxContext {
  chainId: number;
  hash: Hex;
  tx: Transaction;
  /** Null while the transaction is still pending. */
  receipt: TransactionReceipt | null;
  client: PublicClient;
  /** Lazily fetched (and memoized) block the tx was mined in. */
  getBlock(): Promise<Block>;
}

/* Mined transactions are immutable, so contexts are cached without a TTL —
 * a summary call followed by field reads on the same hash costs one RPC
 * round-trip set. Pending contexts (no receipt yet) are NOT cached. */
const MAX_ENTRIES = 20;
const cache = new WeakMap<Module, Map<string, TxContext>>();

/**
 * Resolve a transaction on the requested chain (default: the module's
 * current chain) into its tx + receipt pair.
 */
export async function resolveTxContext(
  module: Module,
  hashArg: Param,
  chainArg?: Param,
): Promise<TxContext> {
  const hash = assertTxHash(String(hashArg));
  const chainId =
    chainArg !== undefined
      ? resolveChainId(chainArg)
      : await module.getChainId();

  let contexts = cache.get(module);
  if (!contexts) {
    contexts = new Map();
    cache.set(module, contexts);
  }
  const key = `${chainId}:${hash.toLowerCase()}`;
  const cached = contexts.get(key);
  if (cached) return cached;

  const client = await clientFor(module, chainId);

  let tx: Transaction;
  try {
    tx = (await client.getTransaction({ hash })) as Transaction;
  } catch {
    throw new ErrorException(
      `transaction ${hash} not found on ${chainLabel(chainId)} — pass the chain as a second argument if it's on another chain`,
    );
  }

  // A transaction can exist but not be mined yet — degrade to a pending
  // context instead of failing the fields that only need the tx itself.
  const receipt = await client
    .getTransactionReceipt({ hash })
    .catch(() => null);

  let block: Promise<Block> | undefined;
  const context: TxContext = {
    chainId,
    hash,
    tx,
    receipt,
    client,
    getBlock() {
      block ??= client.getBlock({ blockHash: receipt?.blockHash as Hex });
      return block;
    },
  };

  if (receipt) {
    if (contexts.size >= MAX_ENTRIES) {
      const oldest = contexts.keys().next().value;
      if (oldest) contexts.delete(oldest);
    }
    contexts.set(key, context);
  }
  return context;
}

/** Receipt of a mined tx, or a clear error for pending ones. */
export function requireReceipt(context: TxContext): TransactionReceipt {
  if (!context.receipt) {
    throw new ErrorException(
      `transaction ${context.hash} is still pending — no receipt yet`,
    );
  }
  return context.receipt;
}

/**
 * Total fee paid, in wei: `gasUsed * effectiveGasPrice`, plus the L1
 * data fee on OP-stack chains when the receipt carries one.
 */
export function computeFee(receipt: TransactionReceipt): bigint {
  const base = receipt.gasUsed * receipt.effectiveGasPrice;
  const l1Fee = (receipt as { l1Fee?: unknown }).l1Fee;
  return typeof l1Fee === "bigint" ? base + l1Fee : base;
}
