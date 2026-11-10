import "../setup";
import { describe, expect, test } from "bun:test";
import type { SimStep } from "@evmcrispr/sdk";
import { ethrexHegotaDevnetProfile as profile } from "@evmcrispr/viem-frames";
import type { Address } from "viem";
import {
  capViolation,
  type MempoolAdmission,
  structureViolation,
  type TargetState,
  traceViolation,
  validationPrefix,
} from "../../src/simulate/admission";
import type { SimFrame } from "../../src/simulate/opcodes";

const SENDER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SPONSOR: Address = "0x000000000000000000000000000000000000bEEF";
const OTHER: Address = "0x000000000000000000000000000000000000dEaD";
const RULES: MempoolAdmission = {
  maxVerifyGas: 500_000n,
  maxTxGas: 16_777_216n,
};
const { DEFAULT, VERIFY, SENDER: SENDER_MODE } = profile.frameModes;
const { PAYMENT, EXECUTION } = profile.approveScopes;

const frame = (mode: number, flags = 0, f: Partial<SimFrame> = {}) =>
  ({
    mode,
    flags,
    target: SENDER,
    data: "0x",
    value: 0n,
    gas: 30_000n,
    stateGas: 0n,
    ...f,
  }) as SimFrame;
const both = frame(VERIFY!, PAYMENT! | EXECUTION!);
const exec = frame(VERIFY!, EXECUTION!);
const pay = (target: Address = SPONSOR) => frame(VERIFY!, PAYMENT!, { target });
const body = frame(SENDER_MODE!, 0, { target: OTHER });
const deploy = frame(DEFAULT!);

describe("the validation prefix a mempool takes", () => {
  test("its four shapes", () => {
    expect(validationPrefix([both, body], profile)).toEqual({
      frames: [0],
      pay: 0,
    });
    expect(validationPrefix([exec, pay(), body], profile)).toEqual({
      frames: [0, 1],
      pay: 1,
    });
    expect(validationPrefix([deploy, both, body], profile)).toEqual({
      frames: [0, 1],
      deploy: 0,
      pay: 1,
    });
    expect(validationPrefix([deploy, exec, pay(), body], profile)).toEqual({
      frames: [0, 1, 2],
      deploy: 0,
      pay: 2,
    });
  });

  test("anything else has none", () => {
    for (const frames of [
      [body, both],
      [exec, body],
      [pay(), body],
      [pay(), exec, body],
      [],
    ])
      expect(validationPrefix(frames, profile)).toBeTypeOf("string");
  });

  const check = (frames: SimFrame[], cost = 2_800n) =>
    structureViolation(
      frames,
      validationPrefix(frames, profile) as never,
      SENDER,
      profile,
      RULES,
      cost,
    );

  test("a verify frame after the prefix", () => {
    expect(check([both, body, both])).toBe(
      "frame 3 is a verify frame after the validation prefix",
    );
    expect(check([both, both])).toBe(
      "frame 2 is a verify frame after the validation prefix",
    );
  });

  test("only the pay frame of two may target another account", () => {
    expect(check([exec, pay(), body])).toBeUndefined();
    expect(check([{ ...both, target: SPONSOR }, body])).toContain(
      `approving execution for ${SPONSOR}, not for the sender`,
    );
    expect(check([{ ...exec, target: SPONSOR }, pay(), body])).toContain(
      "frame 1 is a verify frame approving execution",
    );
  });

  test("the prefix's gas and the signature's fit MAX_VERIFY_GAS, exactly", () => {
    expect(check([{ ...both, gas: 497_200n }, body])).toBeUndefined();
    expect(check([{ ...both, gas: 497_201n }, body])).toBe(
      "its validation prefix may use 500001 gas (its frames' limits, and 2800 to verify the signature), more than the 500000 a mempool spends on validating one",
    );
    // A frame account's ARBITRARY entry costs 100.
    expect(
      check([exec, { ...pay(), gas: 469_900n }, body], 100n),
    ).toBeUndefined();
  });

  test("a transaction over EIP-7825's cap", () => {
    const frames = [both, { ...body, gas: 16_777_216n - 30_000n - 16_000n }];
    expect(capViolation(frames, 16_000n, 0n, RULES)).toBeUndefined();
    expect(capViolation(frames, 16_001n, 0n, RULES)).toContain(
      "more than the 16777216 a transaction may (EIP-7825)",
    );
    expect(capViolation([both], 0n, 16_777_217n, RULES)).toContain(
      "declares 16777217 gas",
    );
  });
});

describe("the trace rules of a validation frame", () => {
  const exists: TargetState = { code: "0x00", balance: 0n, nonce: 0n };
  const missing: TargetState = { code: "0x", balance: 0n, nonce: 0n };
  const delegated: TargetState = {
    code: `0xef0100${OTHER.slice(2)}`,
    balance: 1n,
    nonce: 1n,
  };
  const word = (a: Address) => BigInt(a);
  const steps = (...list: [number, Address?, bigint[]?][]): SimStep[] =>
    list.map(([opcode, address = SPONSOR, stack = []], index) => ({
      index,
      opcode,
      address,
      stack,
    }));
  const run = (
    s: SimStep[],
    {
      deploy = false,
      state = exists,
    }: { deploy?: boolean; state?: TargetState } = {},
  ) => traceViolation(s, { sender: SENDER, deploy, read: async () => state });

  test("banned opcodes, as the node names them", async () => {
    for (const [op, name] of [
      [0x42, "TIMESTAMP"],
      [0x43, "NUMBER"],
      [0x31, "BALANCE"],
      [0x47, "SELFBALANCE"],
      [0x5c, "TLOAD"],
      [0x32, "ORIGIN"],
      [0x41, "COINBASE"],
    ] as const)
      expect(await run(steps([op]))).toBe(`it runs ${name}`);
    expect(await run(steps([0xf2, SPONSOR, [0n, word(OTHER)]]))).toBe(
      "it runs CALLCODE",
    );
    expect(
      await run(steps([0xf2, SPONSOR, [0n, word(OTHER)]]), { deploy: true }),
    ).toBeUndefined();
  });

  test("GAS only right before a call", async () => {
    expect(await run(steps([0x5a]))).toBe(
      "it runs GAS other than right before a call",
    );
    expect(await run(steps([0x5a], [0xfa, SPONSOR, [0n, 4n]]))).toBeUndefined();
    // A step the call did not observe came between them.
    expect(
      await run([
        { index: 0, opcode: 0x5a, address: SPONSOR, stack: [] },
        { index: 2, opcode: 0xfa, address: SPONSOR, stack: [0n, 4n] },
      ]),
    ).toBe("it runs GAS other than right before a call");
  });

  test("storage: the sender's only, and written only in a deploy frame", async () => {
    expect(await run(steps([0x54, SPONSOR]))).toBe(
      `it reads the storage of ${SPONSOR}, which is not the sender`,
    );
    expect(await run(steps([0x54, SENDER]))).toBeUndefined();
    expect(await run(steps([0x55, SENDER]))).toBe(
      "it writes storage outside a deploy frame",
    );
    expect(await run(steps([0x55, SENDER]), { deploy: true })).toBeUndefined();
    expect(await run(steps([0xf0]))).toBe(
      "it runs CREATE outside a deploy frame",
    );
  });

  test("calls and code reads reach existing, undelegated accounts", async () => {
    const call = steps([0xfa, SPONSOR, [0n, word(OTHER)]]);
    const size = steps([0x3b, SPONSOR, [word(OTHER)]]);
    expect(await run(call)).toBeUndefined();
    expect(await run(call, { state: missing })).toBe(
      `its STATICCALL reaches ${OTHER}, which does not exist`,
    );
    expect(await run(size, { state: missing })).toBe(
      `its EXTCODESIZE reaches ${OTHER}, which does not exist`,
    );
    expect(await run(call, { state: delegated })).toBe(
      `its STATICCALL reaches ${OTHER}, an account delegated by EIP-7702`,
    );
    // The sender and the precompiles are always reachable.
    expect(
      await run(steps([0xfa, SPONSOR, [0n, word(SENDER)]]), { state: missing }),
    ).toBeUndefined();
    expect(
      await run(steps([0xfa, SPONSOR, [0n, 4n]]), { state: missing }),
    ).toBeUndefined();
  });
});
