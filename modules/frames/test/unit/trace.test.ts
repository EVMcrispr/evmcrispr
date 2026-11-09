import { describe, expect, test } from "bun:test";
import { pad } from "viem";
import { buildTrace, eventDataCopy, txtrace } from "../../src/simulate/trace";

const A = "0x000000000000000000000000000000000000000A";
const B = "0x000000000000000000000000000000000000000B";
const TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Out of order on purpose: the trace sorts.
const trace = buildTrace(
  {
    balances: [
      { address: B, before: 10n, after: 6n },
      { address: A, before: 0n, after: 4n },
    ],
    slots: [
      {
        address: B,
        slot: pad("0x02"),
        before: pad("0x00"),
        after: pad("0x07"),
      },
      {
        address: A,
        slot: pad("0x01"),
        before: pad("0x05"),
        after: pad("0x00"),
      },
    ],
    codes: [{ address: B, before: pad("0x00"), after: pad("0xc0de") }],
  },
  [
    { address: A, topics: [TRANSFER, pad(A), pad(B)], data: pad("0x2a") },
    { address: B, topics: [], data: "0x0102030405" },
  ],
);
const q = (param: number, in2 = 0n) => txtrace(trace, BigInt(param), in2);

describe("the trace a POST_TX frame reads (Hegota's TXTRACE numbering)", () => {
  test("counts", () => {
    expect(q(0x00)).toEqual({ push: 2n }); // BALANCE_COUNT
    expect(q(0x01)).toEqual({ push: 2n }); // STORAGE_COUNT
    expect(q(0x02)).toEqual({ push: 1n }); // CONTRACT_COUNT
    expect(q(0x0c)).toEqual({ push: 2n }); // EVENT_COUNT
  });

  test("balances, ascending by address", () => {
    expect(q(0x03, 0n)).toEqual({ push: BigInt(A) });
    expect(q(0x04, 0n)).toEqual({ push: 0n });
    expect(q(0x05, 0n)).toEqual({ push: 4n });
    expect(q(0x03, 1n)).toEqual({ push: BigInt(B) });
    expect(q(0x05, 1n)).toEqual({ push: 6n });
  });

  test("storage, by address then slot; contracts", () => {
    expect(q(0x06, 0n)).toEqual({ push: BigInt(A) });
    expect(q(0x07, 0n)).toEqual({ push: 1n });
    expect(q(0x08, 0n)).toEqual({ push: 5n });
    expect(q(0x09, 0n)).toEqual({ push: 0n });
    expect(q(0x09, 1n)).toEqual({ push: 7n });
    expect(q(0x0a, 0n)).toEqual({ push: BigInt(B) });
    expect(q(0x0b, 0n)).toEqual({ push: 0xc0den });
  });

  test("events, in emission order", () => {
    expect(q(0x0d, 0n)).toEqual({ push: BigInt(A) });
    expect(q(0x0e, 0n)).toEqual({ push: 3n });
    expect(q(0x0f, 0n)).toEqual({ push: BigInt(TRANSFER) });
    expect(q(0x11, 0n)).toEqual({ push: BigInt(B) });
    expect(q(0x13, 1n)).toEqual({ push: 5n });
  });

  test("halts on an index out of range, a missing topic, a non-zero count index, an unknown param", () => {
    for (const r of [
      q(0x03, 2n),
      q(0x0d, 2n),
      q(0x10, 1n), // event 1 has no topics
      q(0x12, 0n), // event 0 has 3 topics
      q(0x00, 1n),
      q(0x14, 0n),
    ])
      expect(r).toMatchObject({ fail: expect.any(String) });
  });

  test("EVENTDATACOPY copies an event's data to memory, and halts past it", () => {
    expect(eventDataCopy(trace, 1n, 32n, 1n, 3n)).toEqual({
      write: { offset: 32n, data: "0x020304" },
    });
    expect(eventDataCopy(trace, 1n, 0n, 3n, 3n)).toMatchObject({
      fail: expect.any(String),
    });
    expect(eventDataCopy(trace, 2n, 0n, 0n, 0n)).toMatchObject({
      fail: expect.any(String),
    });
  });
});
