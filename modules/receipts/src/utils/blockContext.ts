import type { Param } from "@evmcrispr/sdk";
import {
  chainLabel,
  clientFor,
  ErrorException,
  type Module,
  resolveChainId,
} from "@evmcrispr/sdk";
import type { Block, BlockTag, PublicClient } from "viem";

const BLOCK_TAGS = new Set<BlockTag>([
  "latest",
  "earliest",
  "safe",
  "finalized",
  "pending",
]);

/**
 * Client for the requested chain (default: the module's current chain).
 * The block readers' counterpart to `resolveTxContext`'s chain handling.
 */
export async function blockClientFor(
  module: Module,
  chainArg?: Param,
): Promise<{ chainId: number; client: PublicClient }> {
  const chainId =
    chainArg !== undefined
      ? resolveChainId(chainArg)
      : await module.getChainId();
  return { chainId, client: await clientFor(module, chainId) };
}

/** Translate a block argument (number, tag or nothing) into a viem
 *  `getBlock` request. Defaults to the latest block. */
function blockQuery(
  blockArg?: Param,
): { blockNumber: bigint } | { blockTag: BlockTag } {
  if (blockArg === undefined) return { blockTag: "latest" };
  const raw = String(blockArg);
  if (BLOCK_TAGS.has(raw as BlockTag)) return { blockTag: raw as BlockTag };
  let blockNumber: bigint;
  try {
    blockNumber = BigInt(raw);
  } catch {
    throw new ErrorException(
      `<block> must be a block number or one of ${[...BLOCK_TAGS].join(", ")}, got ${raw}`,
    );
  }
  if (blockNumber < 0n) {
    throw new ErrorException(`<block> must be unsigned, got ${raw}`);
  }
  return { blockNumber };
}

/**
 * Resolve a sealed block on the requested chain (default: the module's
 * current chain), addressed by number or tag (default: the latest block).
 */
export async function resolveBlock(
  module: Module,
  blockArg?: Param,
  chainArg?: Param,
): Promise<Block> {
  const query = blockQuery(blockArg);
  const { chainId, client } = await blockClientFor(module, chainArg);
  try {
    return await client.getBlock(query);
  } catch {
    const label =
      "blockNumber" in query ? `block ${query.blockNumber}` : `${blockArg}`;
    throw new ErrorException(
      `${label} not found on ${chainLabel(chainId)} — pass the chain as a second argument if it's on another chain`,
    );
  }
}
