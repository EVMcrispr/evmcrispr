import { describe, expect, it } from "bun:test";
import type { BatchedAction, TransactionAction } from "@evmcrispr/sdk";
import type { Address } from "viem";
import {
  layoutFrames,
  MAX_FRAMES,
  PAYMASTER_VERIFY_GAS,
  SELF_VERIFY_GAS,
} from "../../src/layout";
import { type FrameMark, markFrame } from "../../src/marks";

const ME = "0x1111111111111111111111111111111111111111" as Address;
const TO = "0x2222222222222222222222222222222222222222" as Address;
const P = "0x3333333333333333333333333333333333333333" as Address;
const Q = "0x4444444444444444444444444444444444444444" as Address;

const call = (
  to: Address,
  mark?: FrameMark,
  extra: Partial<TransactionAction> = {},
): TransactionAction => {
  const a: TransactionAction = { to, data: "0xabcd", value: 0n, ...extra };
  if (mark) markFrame(a, mark);
  return a;
};
const verify = (to: Address, approve: "execution" | "payment" | "both") =>
  call(to, { mode: "verify", approve });
const base = { sender: ME, chainId: 1337 };
const lay = (actions: any[], more: object = {}) =>
  layoutFrames({ ...base, actions, ...more });

describe("layoutFrames", () => {
  it("a call is a sender frame after a generated self_verify", () => {
    const f = lay([call(TO)]);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({
      mode: "verify",
      approve: "both",
      target: null,
      gas: SELF_VERIFY_GAS,
    });
    expect(f[1]).toMatchObject({ mode: "sender", target: TO });
  });

  it("a call to the sender has a null target", () => {
    expect(
      lay([call(ME.toUpperCase().replace("0X", "0x") as Address)])[1].target,
    ).toBeNull();
  });

  it("a batch is atomic but for its last frame", () => {
    const batch: BatchedAction = {
      type: "batched",
      chainId: 1337,
      from: ME,
      actions: [call(TO), call(TO), call(TO)],
    };
    const f = lay([batch]);
    expect(f.slice(1).map((x) => x.atomic)).toEqual([true, true, undefined]);
  });

  it("--paymaster prepends only_verify and pay", () => {
    const f = lay([call(TO)], { paymaster: P, paymasterData: "0x01" });
    expect(f[0]).toMatchObject({
      approve: "execution",
      target: null,
      gas: SELF_VERIFY_GAS,
    });
    expect(f[1]).toMatchObject({
      approve: "payment",
      target: P,
      data: "0x01",
      gas: PAYMASTER_VERIFY_GAS,
    });
    expect(f[2].mode).toBe("sender");
  });

  it("a default frame right before a verify with its target is its pre_verify", () => {
    const f = lay([
      verify(ME, "execution"),
      call(P, { mode: "default" }),
      verify(P, "payment"),
      call(TO),
    ]);
    expect(f.map((x) => x.mode)).toEqual([
      "verify",
      "default",
      "verify",
      "sender",
    ]);
  });

  it("a default frame elsewhere in the prefix is refused", () => {
    expect(() =>
      lay([call(Q, { mode: "default" }), verify(ME, "both"), call(TO)]),
    ).toThrow(/pre_verify/);
  });

  it("execution approval must target the sender", () => {
    expect(() => lay([verify(P, "execution"), call(TO)])).toThrow(/sender/);
  });

  it("refuses a paymaster together with a written verify", () => {
    expect(() => lay([verify(ME, "both"), call(TO)], { paymaster: P })).toThrow(
      /paymaster/,
    );
  });

  it("refuses a verify inside an atomic group", () => {
    const batch: BatchedAction = {
      type: "batched",
      chainId: 1337,
      from: ME,
      actions: [call(TO), verify(ME, "both"), call(TO)],
    };
    expect(() => lay([batch])).toThrow(/atomic group/);
  });

  it("refuses an atomic group that holds the validation prefix", () => {
    const batch: BatchedAction = {
      type: "batched",
      chainId: 1337,
      from: ME,
      actions: [verify(ME, "both"), call(TO), call(TO)],
    };
    expect(() => lay([batch])).toThrow(/validation prefix/);
  });

  it("refuses an atomic group that straddles the prefix", () => {
    const batch: BatchedAction = {
      type: "batched",
      chainId: 1337,
      from: ME,
      actions: [call(P, { mode: "default" }), verify(P, "payment"), call(TO)],
    };
    expect(() => lay([verify(ME, "execution"), batch])).toThrow(
      /validation prefix/,
    );
  });

  it("refuses a verify after a sender frame", () => {
    expect(() => lay([call(TO), verify(ME, "both")])).toThrow(/after/);
  });

  it("refuses a call from another sender or chain", () => {
    expect(() => lay([call(TO, undefined, { from: Q })])).toThrow(/sender/);
    expect(() => lay([call(TO, undefined, { chainId: 1 })])).toThrow(/chain/);
    expect(() =>
      lay([{ type: "batched", chainId: 1, from: ME, actions: [call(TO)] }]),
    ).toThrow(/chain/);
    expect(() => lay([{ type: "rpc", method: "x", params: [] }])).toThrow(
      /rpc/,
    );
    expect(() => lay([call(TO, undefined, { readOnly: true })])).toThrow(
      /read-only/,
    );
  });

  it("refuses more than 64 frames", () => {
    expect(() =>
      lay(Array.from({ length: MAX_FRAMES }, () => call(TO))),
    ).toThrow(/64/);
    expect(
      lay(Array.from({ length: MAX_FRAMES - 1 }, () => call(TO))),
    ).toHaveLength(MAX_FRAMES);
  });

  it("state gas goes on every body frame and no validation frame", () => {
    const f = lay([call(TO), call(TO)], { paymaster: P, stateGas: 5n });
    expect(f.map((x) => x.stateGas)).toEqual([undefined, undefined, 5n, 5n]);
    expect(lay([call(TO)])[1].stateGas).toBeUndefined();
  });
  it("a default frame in the body is accepted", () => {
    const f = lay([call(TO), call(Q, { mode: "default" })]);
    expect(f.map((x) => x.mode)).toEqual(["verify", "sender", "default"]);
    expect(f[2].target).toBe(Q);
    expect(f[2].gas).toBeUndefined();
  });

  it("an action's gas passes through to its frame", () => {
    const f = lay([
      call(ME, { mode: "verify", approve: "both" }, { gas: 41_000n }),
      call(TO, undefined, { gas: 77_000n }),
      call(Q, { mode: "default" }, { gas: 12_000n }),
    ]);
    expect(f.map((x) => x.gas)).toEqual([41_000n, 77_000n, 12_000n]);
  });

  it("a pre_verify may come before a self_verify", () => {
    const f = lay([
      call(ME, { mode: "default" }, { gas: 40_000n }),
      verify(ME, "both"),
      call(TO),
    ]);
    expect(f.map((x) => x.mode)).toEqual(["default", "verify", "sender"]);
    expect(f[0]).toMatchObject({ target: null, gas: 40_000n });
    expect(f[1]).toMatchObject({ approve: "both", target: null });
  });

  it("a pre_verify may come before a written payment verify", () => {
    const f = lay([
      verify(ME, "execution"),
      call(P, { mode: "default" }),
      verify(P, "payment"),
      call(TO),
    ]);
    expect(f[1]).toMatchObject({ mode: "default", target: P });
    expect(f[2]).toMatchObject({
      mode: "verify",
      approve: "payment",
      target: P,
      gas: PAYMASTER_VERIFY_GAS,
    });
    expect(f[3].stateGas).toBeUndefined();
  });

  it("refuses an action with no recipient (a deployment)", () => {
    expect(() =>
      lay([{ data: "0x6000", value: 0n } as TransactionAction]),
    ).toThrow(/no recipient/);
  });
});
