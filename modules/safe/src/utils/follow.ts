import type { ActionOutcome, Address, BoxHandle } from "@evmcrispr/sdk";
import { viemChainById } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { keccak256, toHex } from "viem";
import type Safe from "..";
import { safeAbi } from "./reads";
import { getQueueLink, getServiceTransaction } from "./txService";

const EXECUTION_SUCCESS = keccak256(toHex("ExecutionSuccess(bytes32,uint256)"));
const EXECUTION_FAILURE = keccak256(toHex("ExecutionFailure(bytes32,uint256)"));

/** Poll interval; mutable so tests can shorten it. */
export const followTiming = { every: 15_000 };

/** Widest block range asked of eth_getLogs at once: under common
 *  public-RPC limits, however long the follower was away. */
const LOG_WINDOW = 2_000n;

interface ExecutionLog {
  topics: readonly (Hex | null)[];
  data: Hex;
  transactionHash: Hex | null;
}

/** The Safe's ExecutionSuccess or ExecutionFailure event for `safeTxHash`
 *  (the hash is indexed on L2 Safes and 1.4.1+, in data before). */
const findExecution = (
  logs: readonly ExecutionLog[],
  safeTxHash: Hex,
): { log: ExecutionLog; success: boolean } | undefined => {
  for (const log of logs) {
    const topic = log.topics[0]?.toLowerCase();
    if (topic !== EXECUTION_SUCCESS && topic !== EXECUTION_FAILURE) continue;
    const hash = log.topics[1] ?? log.data.slice(0, 66);
    if (hash.toLowerCase() === safeTxHash.toLowerCase())
      return { log, success: topic === EXECUTION_SUCCESS };
  }
  return undefined;
};

/** Follows a proposed Safe transaction until it executes or its nonce is
 *  used by another one. Confirmation counts come from the service;
 *  execution is proven on-chain by the Safe's ExecutionSuccess (or
 *  ExecutionFailure) event, searched only in the blocks where the Safe's
 *  nonce moved past the proposal's, in bounded windows. "Replaced" is only
 *  concluded after the last window missed on two polls (an RPC's log index
 *  can trail its state) and the service does not point at an execution. */
export async function followProposal(
  module: Safe,
  box: BoxHandle,
  input: {
    chainId: number;
    safe: Address;
    safeTxHash: Hex;
    nonce: bigint;
    /** A block at or before the proposal was posted. */
    fromBlock: bigint;
  },
): Promise<ActionOutcome> {
  const client = await module.getClient();
  let outcome: ActionOutcome | undefined;
  // The last block at which the proposal's nonce was still unused.
  let unusedAt = input.fromBlock;
  // Once the nonce is used: the head block it was first seen used at (the
  // execution is in [unusedAt, usedBy]), the next block left to search,
  // and whether the whole range already missed once.
  let usedBy: bigint | undefined;
  let searchFrom = input.fromBlock;
  let missedOnce = false;

  const finish = (found: { log: ExecutionLog; success: boolean }) => {
    const tx = found.log.transactionHash ?? undefined;
    // Like a sent transaction's box: the full hash, linked on the explorer
    // when the chain has one.
    const explorer = viemChainById(input.chainId)?.blockExplorers?.default.url;
    const link =
      tx && explorer ? `${explorer.replace(/\/$/, "")}/tx/${tx}` : undefined;
    if (link) box.update({ links: { Transaction: link } });
    const short = !tx
      ? "an unknown transaction"
      : link
        ? `[${tx.slice(0, 10)}…](${link})`
        : tx;
    if (found.success) {
      outcome = { kind: "confirmed", receipt: tx };
      box.done(`Executed in ${short}`);
    } else {
      outcome = {
        kind: "reverted",
        reason: `Executed but reverted in ${short}`,
      };
      box.fail(outcome.reason);
    }
    return "stop" as const;
  };

  /** Asks the service where it saw the proposal execute and checks that
   *  transaction's receipt for the Safe's event. */
  const serviceExecution = async () => {
    const service = await getServiceTransaction(
      module,
      input.chainId,
      input.safeTxHash,
    );
    if (!service.isExecuted || !service.transactionHash) return undefined;
    const receipt = await client.getTransactionReceipt({
      hash: service.transactionHash,
    });
    return findExecution(
      receipt.logs.filter(
        (l) =>
          !("address" in l) ||
          l.address.toLowerCase() === input.safe.toLowerCase(),
      ),
      input.safeTxHash,
    );
  };

  // No Safe{Wallet} queue on chains served only by a custom service.
  try {
    box.update({ links: { Queue: getQueueLink(input.chainId, input.safe) } });
  } catch {}
  await box.poll(
    async () => {
      const block = await client.getBlockNumber({ cacheTime: 0 });
      if (usedBy === undefined) {
        const nonce = await client.readContract({
          address: input.safe,
          abi: safeAbi,
          functionName: "nonce",
          blockNumber: block,
        });
        if (nonce > input.nonce) {
          usedBy = block;
          searchFrom = unusedAt;
        }
      }
      if (usedBy !== undefined) {
        const last = usedBy;
        // Walk the range window by window; every window before the last
        // is searched once. The last is searched again on later polls,
        // as its newest logs may not have been indexed yet.
        for (let from = searchFrom; from <= last; from += LOG_WINDOW) {
          const to =
            from + LOG_WINDOW - 1n < last ? from + LOG_WINDOW - 1n : last;
          const logs = await client.getLogs({
            address: input.safe,
            fromBlock: from,
            toBlock: to,
          });
          const found = findExecution(logs, input.safeTxHash);
          if (found) return finish(found);
          if (to < last) searchFrom = to + 1n;
        }
        const fromService = await serviceExecution().catch(() => undefined);
        if (fromService) return finish(fromService);
        if (!missedOnce) {
          missedOnce = true;
          return "continue";
        }
        outcome = {
          kind: "replaced",
          reason: `Replaced by another transaction at nonce ${input.nonce}`,
        };
        box.fail(outcome.reason);
        return "stop";
      }
      unusedAt = block;
      const service = await getServiceTransaction(
        module,
        input.chainId,
        input.safeTxHash,
      );
      box.update({
        detail: `${service.confirmations.length}/${service.confirmationsRequired} confirmations`,
        progress: [service.confirmations.length, service.confirmationsRequired],
      });
      return "continue";
    },
    { every: followTiming.every },
  );
  if (outcome) return outcome;
  // The box ended without an answer (cancel, script failure, or the host
  // stopped following): the abort reason is the box's final detail.
  const reason = box.signal.reason;
  return {
    kind: "failed",
    reason:
      reason instanceof Error ? reason.message : String(reason ?? "Stopped"),
  };
}
