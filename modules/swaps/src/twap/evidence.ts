import type { Block, Hex, PublicClient, TransactionReceipt } from "viem";
import {
  decodeEventLog,
  decodeFunctionData,
  isAddressEqual,
  isHash,
  parseAbi,
} from "viem";
import { COW_SETTLEMENT } from "../venues/lib/cowApi";
import { accountAbi, accountHistory, unpackAccountCalls } from "./account";
import { accountTrades, indexedOrders } from "./api";
import {
  COMPOSABLE_COW,
  cowAbi,
  decodeSchedule,
  orderHash,
  TIMESTAMP_FACTORY,
} from "./cow";
import { birthBlock, pagedLogs } from "./logs";
import { uidPart } from "./parts";
import type { TwapReference } from "./types";

export const settlementAbi = parseAbi([
  "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)",
  "function filledAmount(bytes uid) view returns (uint256)",
]);
export type ObservationBlock = Block & { number: bigint; hash: Hex };
type Position = { blockNumber: bigint; logIndex: number };
export interface Registration extends Position {
  start: bigint;
  transactionHash: Hex;
  removed?: Position;
}
export interface PartFill {
  index: number;
  uid: Hex;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  transactionHash: Hex;
  blockNumber: string;
  blockHash: Hex;
}
export interface FillEvidence {
  registration: Registration | null;
  fills: Map<number, PartFill>;
  complete: boolean;
  reasons: string[];
  discovery: "observed" | "not-observed" | "unavailable" | "skipped";
}
const before = (a: Position, b: Position) =>
  a.blockNumber < b.blockNumber ||
  (a.blockNumber === b.blockNumber && a.logIndex < b.logIndex);

export async function canonicalReceipt(
  client: PublicClient,
  hash: Hex,
  block: ObservationBlock,
): Promise<TransactionReceipt> {
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== "success" || receipt.blockNumber > block.number)
    throw new Error("Settlement is not in the observation block history");
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (canonical.hash !== receipt.blockHash)
    throw new Error("Receipt was reorganized");
  return receipt;
}

/** A v1 reference predates mining: recover context from the actual Safe call,
 * not the indexer's timestamp or the cabinet, which remove() clears. */
export async function findRegistration(
  client: PublicClient,
  ref: TwapReference,
  block: ObservationBlock,
): Promise<Registration> {
  const nonce = await client.readContract({
    address: ref.account,
    abi: accountAbi,
    functionName: "nonce",
    blockNumber: block.number,
  });
  await accountHistory(
    client,
    ref.account,
    ref.controller,
    ref.chainId,
    nonce,
    block.number,
  );
  const birth = await birthBlock(client, ref.account, block.number);
  const page = await pagedLogs(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: COMPOSABLE_COW,
        event: cowAbi[8],
        args: { owner: ref.account },
        fromBlock,
        toBlock,
        strict: true,
      }),
    birth,
    block.number,
  );
  if (!page.complete) throw new Error(page.reason!);
  const matching = page.logs.filter(
    (log) => orderHash(log.args.params) === ref.orderHash,
  );
  if (matching.length !== 1)
    throw new Error("Missing or ambiguous TWAP registration history");
  const created = matching[0];
  const receipt = await canonicalReceipt(
    client,
    created.transactionHash,
    block,
  );
  if (receipt.blockHash !== created.blockHash)
    throw new Error("Registration was reorganized");
  let found = false;
  const schedule = decodeSchedule(ref.params);
  for (const log of receipt.logs.filter((log) =>
    isAddressEqual(log.address, ref.account),
  )) {
    let tx;
    try {
      tx = decodeEventLog({
        abi: accountAbi,
        eventName: "SafeMultiSigTransaction",
        topics: log.topics,
        data: log.data,
      }).args;
    } catch {
      continue;
    }
    for (const call of unpackAccountCalls(
      tx.to,
      tx.data,
      tx.operation,
      ref.chainId,
    )) {
      if (!isAddressEqual(call.to!, COMPOSABLE_COW)) continue;
      const decoded = decodeFunctionData({ abi: cowAbi, data: call.data! });
      if (
        decoded.functionName !== "create" &&
        decoded.functionName !== "createWithContext"
      )
        continue;
      if (orderHash(decoded.args[0]) !== ref.orderHash) continue;
      if (
        schedule.t0 === 0n &&
        (decoded.functionName !== "createWithContext" ||
          !isAddressEqual(decoded.args[1], TIMESTAMP_FACTORY) ||
          decoded.args[2] !== "0x")
      )
        throw new Error(
          "TWAP mining-time context is not the canonical timestamp factory",
        );
      found = true;
    }
  }
  if (!found)
    throw new Error("Registration is not backed by a verified Safe execution");
  const start =
    schedule.t0 ||
    (await client.getBlock({ blockNumber: created.blockNumber })).timestamp;
  const registration: Registration = {
    start,
    blockNumber: created.blockNumber,
    logIndex: created.logIndex,
    transactionHash: created.transactionHash,
  };
  const executions = await pagedLogs(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: ref.account,
        event: accountAbi[6],
        fromBlock,
        toBlock,
        strict: true,
      }),
    created.blockNumber,
    block.number,
  );
  if (!executions.complete) throw new Error(executions.reason!);
  let activated = false;
  for (const log of executions.logs) {
    const tx = log.args;
    for (const call of unpackAccountCalls(
      tx.to,
      tx.data,
      tx.operation,
      ref.chainId,
    )) {
      if (!isAddressEqual(call.to!, COMPOSABLE_COW)) continue;
      const decoded = decodeFunctionData({ abi: cowAbi, data: call.data! });
      if (
        (decoded.functionName === "create" ||
          decoded.functionName === "createWithContext") &&
        log.transactionHash === created.transactionHash &&
        orderHash(decoded.args[0]) === ref.orderHash
      )
        activated = true;
      if (
        activated &&
        decoded.functionName === "remove" &&
        decoded.args[0] === ref.orderHash
      ) {
        await canonicalReceipt(client, log.transactionHash, block);
        registration.removed = before(created, log)
          ? { blockNumber: log.blockNumber, logIndex: log.logIndex }
          : { blockNumber: created.blockNumber, logIndex: created.logIndex };
        return registration;
      }
    }
  }
  return registration;
}

export function receiptFills(
  receipt: TransactionReceipt,
  ref: TwapReference,
  registration: Registration,
): PartFill[] {
  const schedule = decodeSchedule(ref.params);
  const fills: PartFill[] = [];
  for (const log of receipt.logs) {
    if (
      !isAddressEqual(log.address, COW_SETTLEMENT) ||
      log.blockHash !== receipt.blockHash ||
      !before(registration, log) ||
      (registration.removed && !before(log, registration.removed))
    )
      continue;
    let trade;
    try {
      trade = decodeEventLog({
        abi: settlementAbi,
        eventName: "Trade",
        topics: log.topics,
        data: log.data,
      }).args;
    } catch {
      continue;
    }
    const index = uidPart(ref, registration.start, trade.orderUid);
    if (
      index === null ||
      !isAddressEqual(trade.owner, ref.account) ||
      !isAddressEqual(trade.sellToken, schedule.sellToken) ||
      !isAddressEqual(trade.buyToken, schedule.buyToken)
    )
      continue;
    if (
      trade.sellAmount !== schedule.partSellAmount ||
      trade.buyAmount < schedule.minPartLimit ||
      trade.feeAmount !== 0n
    )
      throw new Error("Settlement evidence conflicts with the TWAP order");
    fills.push({
      index: Number(index),
      uid: trade.orderUid,
      sellAmount: trade.sellAmount.toString(),
      buyAmount: trade.buyAmount.toString(),
      feeAmount: trade.feeAmount.toString(),
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
    });
  }
  return fills;
}

export async function collectEvidence(
  client: PublicClient,
  ref: TwapReference,
  block: ObservationBlock,
  external = false,
): Promise<FillEvidence> {
  const result: FillEvidence = {
    registration: null,
    fills: new Map(),
    complete: false,
    reasons: [],
    discovery: external ? "not-observed" : "skipped",
  };
  try {
    result.registration = await findRegistration(client, ref, block);
  } catch (err) {
    result.reasons.push(
      err instanceof Error ? err.message : "Registration history unavailable",
    );
    return result;
  }
  const registration = result.registration;
  // Request-local cache only: never reuse a receipt from an earlier chain head.
  const receipts = new Map<Hex, Promise<TransactionReceipt>>();
  const consume = async (hash: Hex) => {
    let pending = receipts.get(hash);
    if (!pending) {
      if (receipts.size >= 1000)
        throw new Error("Receipt verification budget exhausted");
      pending = canonicalReceipt(client, hash, block);
      receipts.set(hash, pending);
    }
    for (const fill of receiptFills(await pending, ref, registration)) {
      const previous = result.fills.get(fill.index);
      if (previous && previous.transactionHash !== fill.transactionHash)
        throw new Error("Conflicting settlements for one TWAP part");
      result.fills.set(fill.index, fill);
    }
  };
  const consumeBatch = async (hashes: Hex[]) => {
    const outcomes = await Promise.allSettled(hashes.map(consume));
    const failed = outcomes.find((outcome) => outcome.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  };
  if (external) {
    try {
      for (let offset = 0; offset < 1000; offset += 100) {
        const rows = await indexedOrders(ref.chainId, ref.account, offset);
        if (
          rows.some(
            (row) =>
              row.chainId === ref.chainId &&
              String(row.owner).toLowerCase() === ref.account.toLowerCase() &&
              row.hash === ref.orderHash &&
              row.txHash === registration.transactionHash,
          )
        ) {
          result.discovery = "observed";
          break;
        }
        if (rows.length < 100) break;
      }
    } catch {
      result.discovery = "unavailable";
    }
    try {
      for (let offset = 0; offset < 1000; offset += 100) {
        const trades = await accountTrades(ref.chainId, ref.account, offset);
        const hashes = new Set(
          trades
            .filter(
              (trade) =>
                uidPart(ref, registration.start, trade.orderUid) !== null &&
                typeof trade.txHash === "string" &&
                isHash(trade.txHash),
            )
            .map((trade) => trade.txHash as Hex),
        );
        // Four concurrent receipt reads, regardless of the API page size.
        const queue = [...hashes];
        for (let i = 0; i < queue.length; i += 4)
          await consumeBatch(queue.slice(i, i + 4));
        if (trades.length < 100) break;
      }
    } catch {
      /* API hints cannot establish absence; scan canonical logs below. */
    }
  }
  const total = decodeSchedule(ref.params).n;
  if (BigInt(result.fills.size) === total) {
    result.complete = true;
    return result;
  }
  const page = await pagedLogs(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: COW_SETTLEMENT,
        event: settlementAbi[0],
        args: { owner: ref.account },
        fromBlock,
        toBlock,
        strict: true,
      }),
    registration.blockNumber,
    registration.removed?.blockNumber ?? block.number,
  );
  try {
    const hashes = [
      ...new Set(
        page.logs
          .filter(
            (log) =>
              uidPart(ref, registration.start, log.args.orderUid) !== null,
          )
          .map((log) => log.transactionHash),
      ),
    ];
    for (let i = 0; i < hashes.length; i += 4)
      await consumeBatch(hashes.slice(i, i + 4));
    result.complete = page.complete;
    if (!page.complete) result.reasons.push(page.reason!);
  } catch (err) {
    result.reasons.push(
      err instanceof Error ? err.message : "Receipt verification failed",
    );
  }
  return result;
}
