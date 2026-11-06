import { describe, expect, test } from "bun:test";
import {
  ATOMIC_BATCH_FLAG,
  atomic,
  call,
  onlyVerify,
  pay,
  selfVerify,
} from "../../src";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";

describe("frame builders", () => {
  test("validation frames: VERIFY with their approval scope and their own limits", () => {
    expect(selfVerify()).toMatchObject({
      mode: 1,
      flags: 0x3,
      target: null,
      limits: { execution: 30_000n, state: 0n },
    });
    expect(onlyVerify()).toMatchObject({ mode: 1, flags: 0x2, target: null });
    expect(pay(A, { data: "0xfc735e99" })).toMatchObject({
      mode: 1,
      flags: 0x1,
      target: A,
      data: "0xfc735e99",
    });
  });

  test("a call is a SENDER frame whose limits are left to the estimate", () => {
    expect(call({ to: A, value: 1n })).toEqual({
      mode: 2,
      flags: 0,
      target: A,
      limits: undefined,
      value: 1n,
      data: "0x",
    });
    expect(call({ to: A, gas: 10n }).limits).toEqual({
      execution: 10n,
      state: 0n,
    });
  });

  test("atomic flags every frame of the batch but the last", () => {
    const batch = atomic([call({ to: A }), call({ to: B }), call({ to: A })]);
    expect(batch.map((f) => f.flags)).toEqual([
      ATOMIC_BATCH_FLAG,
      ATOMIC_BATCH_FLAG,
      0,
    ]);
  });

  test("an atomic batch refuses a VERIFY frame", () => {
    expect(() => atomic([selfVerify(), call({ to: A })])).toThrow("VERIFY");
  });
});
