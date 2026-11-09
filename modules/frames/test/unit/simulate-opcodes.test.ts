import { describe, expect, test } from "bun:test";
import type { SimOpcode } from "@evmcrispr/sdk";
import { eip8141TracerProfile as profile } from "@evmcrispr/viem-frames";
import { pad } from "viem";
import { type FrameContext, frameOpcodes } from "../../src/simulate/opcodes";

const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SPONSOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const { VERIFY, SENDER: SENDER_MODE } = profile.frameModes;
const { PAYMENT, EXECUTION } = profile.approveScopes;

function context(): FrameContext {
  return {
    sender: SENDER,
    nonce: 4n,
    maxFeePerGas: 7n,
    maxPriorityFeePerGas: 1n,
    sigHash: `0x${"ab".repeat(32)}`,
    frames: [
      {
        mode: VERIFY,
        flags: EXECUTION,
        target: SENDER,
        data: "0x",
        value: 0n,
        gas: 30_000n,
        stateGas: 0n,
      },
      {
        mode: VERIFY,
        flags: PAYMENT,
        target: SPONSOR,
        data: "0x1234",
        value: 0n,
        gas: 50_000n,
        stateGas: 0n,
      },
      {
        mode: SENDER_MODE,
        flags: 0,
        target: SPONSOR,
        data: "0xd09de08a",
        value: 5n,
        gas: 21_000n,
        stateGas: 200_000n,
      },
    ],
    current: 1,
    statuses: ["impersonated"],
    gasUsed: [0n],
    signature: { scheme: 1, signer: SENDER, data: `0x${"00".repeat(65)}` },
  };
}

const op = (ctx: FrameContext, name: string): SimOpcode =>
  frameOpcodes(ctx).find((o) => o.name === name)!;
const run = (
  ctx: FrameContext,
  name: string,
  operands: bigint[],
  address: `0x${string}` = SPONSOR,
) => op(ctx, name).run({ address, operands, isStatic: true });

describe("the frame opcodes, simulated", () => {
  test("APPROVE by the frame's target, within its flags, ends the frame", () => {
    const ctx = context();
    expect(run(ctx, "APPROVE", [0n, 0n, BigInt(PAYMENT)])).toEqual({
      return: { offset: 0n, size: 0n },
    });
    expect(ctx.approved).toBe(PAYMENT);
  });

  test("APPROVE is refused outside a verify frame, by another account, or beyond the flags", () => {
    const ctx = context();
    expect(
      run(ctx, "APPROVE", [0n, 0n, BigInt(PAYMENT)], SENDER),
    ).toMatchObject({
      fail: expect.stringContaining("not the frame's target"),
    });
    expect(run(ctx, "APPROVE", [0n, 0n, BigInt(EXECUTION)])).toMatchObject({
      fail: expect.stringContaining("do not allow"),
    });
    ctx.current = 2;
    expect(run(ctx, "APPROVE", [0n, 0n, BigInt(PAYMENT)])).toMatchObject({
      fail: "APPROVE outside a VERIFY frame",
    });
    expect(ctx.approved).toBeUndefined();
  });

  test("TXPARAM answers the transaction's fields", () => {
    const ctx = context();
    expect(run(ctx, "TXPARAM", [2n])).toEqual({ push: BigInt(SENDER) });
    expect(run(ctx, "TXPARAM", [1n])).toEqual({ push: 4n });
    expect(run(ctx, "TXPARAM", [8n])).toEqual({ push: BigInt(ctx.sigHash) });
    expect(run(ctx, "TXPARAM", [9n])).toEqual({ push: 3n });
    expect(run(ctx, "TXPARAM", [10n])).toEqual({ push: 1n });
    expect(run(ctx, "TXPARAM", [5n])).toMatchObject({
      fail: expect.any(String),
    });
  });

  test("FRAMEDATALOAD and FRAMEDATACOPY read a frame's data, zero past its end", () => {
    const ctx = context();
    expect(run(ctx, "FRAMEDATALOAD", [0n, 1n])).toEqual({
      push: BigInt(pad("0x1234", { dir: "right" })),
    });
    expect(run(ctx, "FRAMEDATACOPY", [0n, 1n, 3n, 2n])).toEqual({
      write: { offset: 0n, data: "0x9de08a" },
    });
    expect(run(ctx, "FRAMEDATACOPY", [0n, 3n, 2n, 2n])).toEqual({
      write: { offset: 0n, data: "0x8a00" },
    });
    expect(run(ctx, "FRAMEDATALOAD", [0n, 9n])).toMatchObject({
      fail: expect.any(String),
    });
  });

  test("FRAMEPARAM answers a frame's fields; a status only once it ran", () => {
    const ctx = context();
    expect(run(ctx, "FRAMEPARAM", [2n, 0n])).toEqual({ push: BigInt(SPONSOR) });
    expect(run(ctx, "FRAMEPARAM", [2n, 8n])).toEqual({ push: 5n });
    expect(run(ctx, "FRAMEPARAM", [1n, 6n])).toEqual({ push: BigInt(PAYMENT) });
    expect(run(ctx, "FRAMEPARAM", [0n, 5n])).toEqual({ push: 1n });
    expect(run(ctx, "FRAMEPARAM", [2n, 5n])).toMatchObject({
      fail: expect.stringContaining("has not run"),
    });
  });

  test("SIGPARAM and SIGDATACOPY answer the placeholder signature", () => {
    const ctx = context();
    expect(run(ctx, "SIGPARAM", [0n, 0n])).toEqual({ push: BigInt(SENDER) });
    expect(run(ctx, "SIGPARAM", [0n, 3n])).toEqual({ push: 65n });
    expect(run(ctx, "SIGDATACOPY", [0n, 0n, 2n, 0n])).toEqual({
      write: { offset: 0n, data: "0x0000" },
    });
    expect(run(ctx, "SIGPARAM", [1n, 0n])).toMatchObject({
      fail: expect.any(String),
    });
  });
});
