import type { Hex, PublicClient } from "viem";
import { erc20Abi } from "viem";
import {
  COW_VAULT_RELAYER,
  explorerLink,
  explorerTxLink,
} from "../venues/lib/cowApi";
import { orderbookOrders } from "./api";
import { readOrderState } from "./cow";
import { collectEvidence, type ObservationBlock } from "./evidence";
import { partOrder, partUid } from "./parts";
import type { TwapReadOptions, TwapReference, TwapStatus } from "./types";

export async function twapSnapshot(
  client: PublicClient,
  ref: TwapReference,
  options: TwapReadOptions = {},
  page?: { offset: number; limit: number },
) {
  if (
    page &&
    (!Number.isInteger(page.offset) ||
      page.offset < 0 ||
      page.offset > 0xffffffff ||
      !Number.isInteger(page.limit) ||
      page.limit < 1 ||
      page.limit > 128)
  )
    throw new Error(
      "TWAP offset must fit uint32 and limit must be between 1 and 128",
    );
  const block =
    options.block ?? ((await client.getBlock()) as ObservationBlock);
  const state = await readOrderState(client, ref, block.number);
  const evidence = await collectEvidence(
    client,
    ref,
    block,
    options.external,
    options.signal,
  );
  const start = evidence.registration?.start ?? state.start;
  const s = state.schedule;
  const end = start + s.n * s.t;
  const [balance, allowance, finalized] = await Promise.all([
    client.readContract({
      address: s.sellToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [ref.account],
      blockNumber: block.number,
    }),
    client.readContract({
      address: s.sellToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [ref.account, COW_VAULT_RELAYER],
      blockNumber: block.number,
    }),
    client.getBlock({ blockTag: "finalized" }).catch(() => null),
  ]);
  const current = !start
    ? null
    : block.timestamp < start
      ? 0
      : Math.min(Number(s.n) - 1, Number((block.timestamp - start) / s.t));
  const offset = page?.offset ?? current ?? 0;
  const length = start
    ? Math.max(0, Math.min(page?.limit ?? 1, Number(s.n) - offset))
    : 0;
  const entries = Array.from({ length }, (_, n) => {
    const index = offset + n;
    return {
      index,
      uid: partUid(ref, start, BigInt(index)),
      order: partOrder(ref, start, BigInt(index)),
    };
  });
  let submissionState: TwapStatus["submission"]["state"] = options.external
    ? "not-observed"
    : "skipped";
  const accepted = new Map<Hex, string>();
  if (options.external && entries.length) {
    options.signal?.throwIfAborted();
    try {
      const orders = await orderbookOrders(
        ref.chainId,
        entries.map((entry) => entry.uid),
      );
      for (const row of orders) {
        const entry = entries.find(
          (entry) => entry.uid === String(row.uid).toLowerCase(),
        );
        if (
          !entry ||
          String(row.owner).toLowerCase() !== ref.account.toLowerCase() ||
          row.signingScheme !== "eip1271" ||
          !["open", "fulfilled", "expired", "cancelled"].includes(
            String(row.status),
          )
        )
          continue;
        const expected = entry.order;
        if (
          Object.entries(expected).some(
            ([key, value]) =>
              String(row[key]).toLowerCase() !== String(value).toLowerCase(),
          )
        )
          continue;
        accepted.set(entry.uid, String(row.status));
      }
    } catch {
      submissionState = "unavailable";
    }
  }
  const canonicalHead = await client.getBlock({ blockNumber: block.number });
  const reorganized = canonicalHead.hash !== block.hash;
  if (reorganized) {
    evidence.complete = false;
    evidence.fills.clear();
    evidence.reasons.push("Observation block was reorganized; retry");
  }
  const fills = [...evidence.fills.values()];
  const allFilled = BigInt(fills.length) === s.n;
  const filled: TwapStatus["filled"] = allFilled
    ? "complete"
    : !evidence.complete
      ? "unknown"
      : fills.length
        ? "partial"
        : "none";
  const lastEvidenceBlock = allFilled
    ? fills.reduce(
        (n, fill) =>
          BigInt(fill.blockNumber) > n ? BigInt(fill.blockNumber) : n,
        0n,
      )
    : block.number;
  const finality =
    reorganized || finalized?.number === undefined || finalized.number === null
      ? "unknown"
      : lastEvidenceBlock <= finalized.number
        ? "finalized"
        : "pending";
  const currentEntry = entries.find((entry) => entry.index === current);
  const currentStatus = currentEntry
    ? accepted.get(currentEntry.uid)
    : undefined;
  const status: TwapStatus = {
    registered: state.registered,
    cancelled: evidence.registration
      ? Boolean(evidence.registration.removed)
      : null,
    expired: start ? block.timestamp >= end : null,
    schedule: !state.registered
      ? "unregistered"
      : block.timestamp < start
        ? "scheduled"
        : block.timestamp >= end
          ? "expired"
          : s.span !== 0n && (block.timestamp - start) % s.t >= s.span
            ? "between-windows"
            : "active",
    filled,
    filledParts: fills.length,
    totalParts: Number(s.n),
    executedSellAmount: fills
      .reduce((n, fill) => n + BigInt(fill.sellAmount), 0n)
      .toString(),
    executedBuyAmount: fills
      .reduce((n, fill) => n + BigInt(fill.buyAmount), 0n)
      .toString(),
    evidence: {
      complete: evidence.complete || allFilled,
      reasons: evidence.reasons,
      blockNumber: block.number.toString(),
      blockHash: block.hash,
    },
    finality,
    discovery: evidence.discovery,
    submission: {
      partIndex: current,
      ...(currentEntry
        ? {
            uid: currentEntry.uid,
            explorer: explorerLink(ref.chainId, currentEntry.uid),
          }
        : {}),
      state: currentStatus
        ? "observed"
        : start && block.timestamp < start && submissionState === "not-observed"
          ? "not-due"
          : submissionState,
      ...(currentStatus ? { orderbookStatus: currentStatus } : {}),
    },
    start: start ? start.toString() : null,
    end: start ? end.toString() : null,
    remainingSellBalance: balance.toString(),
    allowance: allowance.toString(),
  };
  const items = entries.map(({ index, uid, order }) => {
    const fill = evidence.fills.get(index);
    const from = start + BigInt(index) * s.t;
    return {
      index,
      uid,
      explorer: explorerLink(ref.chainId, uid),
      start: from.toString(),
      validTo: order.validTo,
      window:
        block.timestamp < from
          ? "scheduled"
          : block.timestamp > BigInt(order.validTo)
            ? "expired"
            : "active",
      registered: state.registered,
      submission: accepted.has(uid) ? "observed" : submissionState,
      orderbookStatus: accepted.get(uid) ?? null,
      filled: fill ? "complete" : evidence.complete ? "none" : "unknown",
      settlement: fill
        ? {
            ...fill,
            explorer: explorerTxLink(ref.chainId, fill.transactionHash),
          }
        : null,
      finality:
        !fill || finalized?.number === undefined || finalized.number === null
          ? "unknown"
          : BigInt(fill.blockNumber) <= finalized.number
            ? "finalized"
            : "pending",
    };
  });
  return {
    status,
    items,
    offset,
    nextOffset:
      offset + length < Number(s.n) && length ? offset + length : null,
  };
}
