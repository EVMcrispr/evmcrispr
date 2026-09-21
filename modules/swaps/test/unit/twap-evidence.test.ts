import { describe, expect, it } from "bun:test";
import type { Hex, PublicClient, TransactionReceipt } from "viem";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
  zeroHash,
} from "viem";
import { cowTwap, orderHash } from "../../src/twap/cow";
import {
  canonicalReceipt,
  type ObservationBlock,
  type Registration,
  receiptFills,
  settlementAbi,
} from "../../src/twap/evidence";
import { pagedLogs } from "../../src/twap/logs";
import { partOrder, partUid, uidPart } from "../../src/twap/parts";
import type { TwapReference } from "../../src/twap/types";
import { COW_SETTLEMENT } from "../../src/venues/lib/cowApi";
import { GNO, SOME_ADDRESS, WXDAI } from "../fixtures";
import upstreamFixtures from "../fixtures/twap-upstream.json";

const params = cowTwap.buildParams(
  {
    sellToken: WXDAI,
    buyToken: GNO,
    receiver: SOME_ADDRESS,
    partSellAmount: 4n,
    minPartLimit: 2n,
    t0: 1700000000n,
    n: 3n,
    t: 3600n,
    span: 60n,
    appData: zeroHash,
  },
  zeroHash,
);
const ref: TwapReference = {
  version: 1,
  provider: "CoWSwap",
  chainId: 100,
  controller: SOME_ADDRESS,
  account: SOME_ADDRESS,
  slot: 0,
  params,
  orderHash: orderHash(params),
};
const start = 1700000000n;
const hash = `0x${"11".repeat(32)}` as Hex;
const registration: Registration = {
  start,
  blockNumber: 10n,
  logIndex: 1,
  transactionHash: hash,
};
function receipt(index = 0n, sell = 4n, buy = 3n): TransactionReceipt {
  return {
    status: "success",
    transactionHash: hash,
    blockNumber: 11n,
    blockHash: hash,
    logs: [
      {
        address: COW_SETTLEMENT,
        blockNumber: 11n,
        blockHash: hash,
        transactionHash: hash,
        logIndex: 2,
        topics: encodeEventTopics({
          abi: settlementAbi,
          eventName: "Trade",
          args: { owner: ref.account },
        }),
        data: encodeAbiParameters(
          parseAbiParameters("address,address,uint256,uint256,uint256,bytes"),
          [WXDAI, GNO, sell, buy, 0n, partUid(ref, start, index)],
        ),
      },
    ],
  } as unknown as TransactionReceipt;
}

describe("TWAP > settlement evidence", () => {
  it.each(upstreamFixtures)(
    "matches production registration and child UID on chain $reference.chainId",
    (fixture) => {
      // Captured independently from canonical registration receipts and published
      // CoW orderbook children. The fixture accounts are external upstream Safes,
      // not EVMcrispr execution accounts; only the protocol encoding is compared.
      const reference = fixture.reference as TwapReference;
      const start = BigInt(fixture.start);
      const index = BigInt(fixture.part);
      expect(partUid(reference, start, index)).toBe(fixture.uid as Hex);
      const order = partOrder(reference, start, index);
      for (const [key, value] of Object.entries(fixture.order))
        expect(String(order[key as keyof typeof order]).toLowerCase()).toBe(
          String(value).toLowerCase(),
        );
    },
  );
  it("derives the exact inclusive validTo and reverses only authenticated UIDs", () => {
    expect(partOrder(ref, start, 0n).validTo).toBe(1700000059);
    expect(partOrder(ref, start, 2n).validTo).toBe(1700007259);
    expect(uidPart(ref, start, partUid(ref, start, 2n))).toBe(2n);
    expect(
      uidPart({ ...ref, chainId: 1 }, start, partUid(ref, start, 2n)),
    ).toBeNull();
    expect(
      uidPart({ ...ref, account: GNO }, start, partUid(ref, start, 2n)),
    ).toBeNull();
    expect(uidPart(ref, start + 1n, partUid(ref, start, 2n))).toBeNull();
    expect(uidPart(ref, start, zeroHash)).toBeNull();
    expect(() => partOrder(ref, start, 3n)).toThrow();
  });

  it("counts only the expected settlement event during this registration's authorization", () => {
    expect(receiptFills(receipt(), ref, registration)).toHaveLength(1);
    const wrongContract = receipt();
    wrongContract.logs[0].address = GNO;
    expect(receiptFills(wrongContract, ref, registration)).toHaveLength(0);
    expect(
      receiptFills(receipt(), ref, {
        ...registration,
        removed: { blockNumber: 11n, logIndex: 1 },
      }),
    ).toHaveLength(0);
    expect(
      receiptFills(receipt(), ref, { ...registration, blockNumber: 12n }),
    ).toHaveLength(0);
    expect(() => receiptFills(receipt(0n, 3n), ref, registration)).toThrow(
      "conflicts",
    );
    expect(() => receiptFills(receipt(0n, 4n, 1n), ref, registration)).toThrow(
      "conflicts",
    );
  });

  it("rejects receipts after the anchor block, reverted transactions and reorgs", async () => {
    const value = receipt();
    const client = {
      getTransactionReceipt: async () => value,
      getBlock: async () => ({ hash }),
    } as unknown as PublicClient;
    const block = { number: 12n, hash } as ObservationBlock;
    expect(await canonicalReceipt(client, hash, block)).toBe(value);
    await expect(
      canonicalReceipt(client, hash, { ...block, number: 10n }),
    ).rejects.toThrow("observation");
    value.status = "reverted";
    await expect(canonicalReceipt(client, hash, block)).rejects.toThrow();
    value.status = "success";
    await expect(
      canonicalReceipt(
        { ...client, getBlock: async () => ({ hash: zeroHash }) } as any,
        hash,
        block,
      ),
    ).rejects.toThrow("reorganized");
  });

  it("paginates RPC ranges and never calls a budget-truncated scan complete", async () => {
    const seen: [bigint, bigint][] = [];
    const result = await pagedLogs(
      async (from, to) => {
        seen.push([from, to]);
        return [from];
      },
      5n,
      10005n,
    );
    expect(result.complete).toBe(true);
    expect(seen).toEqual([
      [5n, 5004n],
      [5005n, 10004n],
      [10005n, 10005n],
    ]);
    const truncated = await pagedLogs(async () => [], 0n, 1000000n);
    expect(truncated.complete).toBe(false);
    expect(truncated.reason).toContain("budget");
    const unavailable = await pagedLogs(
      async () => {
        throw new Error("archive missing");
      },
      0n,
      10n,
    );
    expect(unavailable.complete).toBe(false);
  });
});
