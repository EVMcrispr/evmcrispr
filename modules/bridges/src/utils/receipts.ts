import type { Module } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Hex, Log } from "viem";
import { SUPPORTED_CHAINS } from "../addresses";
import { clientFor } from "./clients";

export interface SourceTx {
  chainId: number;
  hash: Hex;
  logs: Log[];
}

export function assertTxHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ErrorException(
      `<transferId> must be the source-chain transaction hash of the bridge (0x + 64 hex chars), got ${value}`,
    );
  }
  return value as Hex;
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
        fromChainId ? `chain ${fromChainId}` : "any supported chain"
      }; pass --from-chain <chain> if the source chain isn't configured`,
    );
  }
  return found;
}
