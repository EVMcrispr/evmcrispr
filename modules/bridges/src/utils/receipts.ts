import type { Module } from "@evmcrispr/sdk";
import {
  assertTxHash as assertHash,
  chainLabel,
  clientFor,
  ErrorException,
} from "@evmcrispr/sdk";
import type { Hex, Log } from "viem";
import { SUPPORTED_CHAINS } from "../addresses";

export interface SourceTx {
  chainId: number;
  hash: Hex;
  logs: Log[];
}

export function assertTxHash(value: string): Hex {
  return assertHash(
    value,
    "<transferId> must be the source-chain transaction hash of the bridge",
  );
}

/**
 * Locate the receipt of a bridge's source transaction. With `fromChainId`
 * the lookup is direct; otherwise every supported chain is probed in
 * parallel (per-chain failures tolerated).
 */
export async function findSourceReceipt(
  module: Module,
  hash: Hex,
  fromChainId?: number,
): Promise<SourceTx> {
  const chains = fromChainId ? [fromChainId] : [...SUPPORTED_CHAINS];
  const results = await Promise.all(
    chains.map(async (chainId) => {
      try {
        const client = await clientFor(module, chainId);
        const receipt = await client.getTransactionReceipt({ hash });
        return receipt ? { chainId, hash, logs: receipt.logs as Log[] } : null;
      } catch {
        return null;
      }
    }),
  );
  const found = results.find((r) => r !== null);
  if (!found) {
    throw new ErrorException(
      `couldn't find transaction ${hash} on ${
        fromChainId ? chainLabel(fromChainId) : "any supported chain"
      }; pass --from-chain <chain> if the source chain isn't configured`,
    );
  }
  return found;
}
