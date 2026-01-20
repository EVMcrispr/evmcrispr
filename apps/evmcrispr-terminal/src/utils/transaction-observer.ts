import type { Address, Hash, PublicClient } from "viem";

export interface ObserveTransactionParams {
  /** Target contract address */
  to: Address;
  /** Expected calldata */
  data: `0x${string}`;
  /** Expected sender address */
  from: Address;
  /** Viem public client for blockchain queries */
  publicClient: PublicClient;
  /** Callback for status updates (e.g., logging) */
  onStatusUpdate?: (message: string) => void;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Polling interval in milliseconds (default: 3000) */
  pollingInterval?: number;
  /** Number of past blocks to check on start (default: 10) */
  lookbackBlocks?: number;
}

export interface ObserveTransactionResult {
  /** The transaction hash that was found */
  hash: Hash;
  /** Block number where the transaction was included */
  blockNumber: bigint;
}

/**
 * Formats an address for display (first 6 and last 4 characters)
 */
function formatAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Checks a block for a matching transaction
 */
async function checkBlockForTransaction(
  publicClient: PublicClient,
  blockNumber: bigint,
  expectedFrom: Address,
  expectedTo: Address,
  expectedData: `0x${string}`,
): Promise<ObserveTransactionResult | null> {
  try {
    const block = await publicClient.getBlock({
      blockNumber,
      includeTransactions: true,
    });

    for (const tx of block.transactions) {
      // Skip if transaction is just a hash (shouldn't happen with includeTransactions: true)
      if (typeof tx === "string") continue;

      // Check if this transaction matches our expected parameters
      if (
        tx.from.toLowerCase() === expectedFrom.toLowerCase() &&
        tx.to?.toLowerCase() === expectedTo.toLowerCase() &&
        tx.input.toLowerCase() === expectedData.toLowerCase()
      ) {
        return {
          hash: tx.hash,
          blockNumber: tx.blockNumber!,
        };
      }
    }
  } catch (error) {
    // Block might not exist yet or other error - ignore and continue polling
    console.debug(`Error checking block ${blockNumber}:`, error);
  }

  return null;
}

/**
 * Observes the blockchain for a specific transaction from another signer.
 * Watches for new blocks and checks if they contain a transaction matching
 * the expected parameters (from, to, data).
 *
 * @returns Promise that resolves when the matching transaction is confirmed
 * @throws Error if aborted via AbortSignal
 */
export async function observeTransaction(
  params: ObserveTransactionParams,
): Promise<ObserveTransactionResult> {
  const {
    to,
    data,
    from,
    publicClient,
    onStatusUpdate,
    signal,
    pollingInterval = 3000,
    lookbackBlocks = 10,
  } = params;

  const formattedFrom = formatAddress(from);

  onStatusUpdate?.(
    `:waiting: Waiting for ${formattedFrom} to execute transaction...`,
  );

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error("Observation cancelled");
  }

  // First, check recent blocks in case transaction was already executed
  const currentBlock = await publicClient.getBlockNumber();
  const startBlock =
    currentBlock > BigInt(lookbackBlocks)
      ? currentBlock - BigInt(lookbackBlocks)
      : 0n;

  for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
    if (signal?.aborted) {
      throw new Error("Observation cancelled");
    }

    const result = await checkBlockForTransaction(
      publicClient,
      blockNum,
      from,
      to,
      data,
    );

    if (result) {
      onStatusUpdate?.(
        `:success: Transaction from ${formattedFrom} confirmed in block ${result.blockNumber}`,
      );
      return result;
    }
  }

  // If not found in recent blocks, start watching for new blocks
  let lastCheckedBlock = currentBlock;

  return new Promise((resolve, reject) => {
    // Handle abort signal
    const abortHandler = () => {
      clearInterval(pollInterval);
      reject(new Error("Observation cancelled"));
    };

    signal?.addEventListener("abort", abortHandler);

    const pollInterval = setInterval(async () => {
      try {
        const latestBlock = await publicClient.getBlockNumber();

        // Check all new blocks since last check
        for (
          let blockNum = lastCheckedBlock + 1n;
          blockNum <= latestBlock;
          blockNum++
        ) {
          if (signal?.aborted) {
            clearInterval(pollInterval);
            signal?.removeEventListener("abort", abortHandler);
            reject(new Error("Observation cancelled"));
            return;
          }

          const result = await checkBlockForTransaction(
            publicClient,
            blockNum,
            from,
            to,
            data,
          );

          if (result) {
            clearInterval(pollInterval);
            signal?.removeEventListener("abort", abortHandler);
            onStatusUpdate?.(
              `:success: Transaction from ${formattedFrom} confirmed in block ${result.blockNumber}`,
            );
            resolve(result);
            return;
          }
        }

        lastCheckedBlock = latestBlock;
      } catch (error) {
        // Log error but continue polling - network issues shouldn't stop observation
        console.error("Error during transaction observation:", error);
      }
    }, pollingInterval);
  });
}
