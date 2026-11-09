import "../setup";
import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import { frameAction } from "../../src/actions";
import type { FrameActionData } from "../../src/frame-action";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const OWNER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const SPONSOR = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as const;
const TO = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as const;
const TRANSFER =
  "0xa9059cbb00000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b9060000000000000000000000000000000000000000000000000de0b6b3a7640000" as const;
const CHECK = `0xb2225351${"0".repeat(63)}3` as const;

const frame = (
  over: Partial<FrameActionData> & { chainId?: number; from?: Address } = {},
) => {
  const { chainId = 1337, from = ACCOUNT, ...data } = over;
  return frameAction.create({
    chainId,
    from,
    data: {
      frames: [
        {
          mode: "verify",
          approve: "both",
          target: null,
          data: CHECK,
          value: 0n,
          gas: 40_000n,
        },
        {
          mode: "sender",
          target: TO,
          data: TRANSFER,
          value: 10n ** 18n,
          gas: 50_000n,
          stateGas: 200_000n,
        },
      ],
      mempool: "alt",
      account: { kind: "frame-account", owner: OWNER },
      ...data,
    },
  }).description;
};

describe("the frames module describes its frame action", () => {
  test("frames, payer and typed data", () => {
    const d = frame();
    expect(d.title).toBe(`Frame transaction from account ${ACCOUNT}`);
    expect(d.steps).toHaveLength(2);
    const [verify, call] = d.steps;
    expect(verify!.label).toContain("verify approving both");
    expect(verify!.label).toContain("gas 40000");
    expect(verify!.call).toEqual({ to: ACCOUNT, data: CHECK, value: 0n });
    expect(call!.label).toContain("sender");
    expect(call!.label).toContain("gas 50000");
    expect(call!.label).toContain("state gas 200000");
    expect(call!.call).toEqual({ to: TO, data: TRANSFER, value: 10n ** 18n });
    expect(d.detail).toContain(`paid by the account ${ACCOUNT}`);
    expect(d.warning).toBeUndefined();
    const notes = d.notes.join("\n");
    expect(notes).toContain("FrameTransaction(bytes32 sigHash)");
    expect(notes).toContain('"EVMcrispr Frame Account"');
    expect(notes).toContain('version "1"');
    expect(notes).toContain("Alt-mempool devnet");
    expect(notes).toContain(`verifying contract ${ACCOUNT}`);
    expect(notes).toContain(OWNER);
  });

  test("a sponsor that approves payment is the payer", () => {
    const d = frame({
      frames: [
        {
          mode: "verify",
          approve: "execution",
          target: null,
          data: CHECK,
          value: 0n,
          gas: 40_000n,
        },
        {
          mode: "verify",
          approve: "payment",
          target: SPONSOR,
          data: "0xfc735e99",
          value: 0n,
          gas: 50_000n,
        },
      ],
    });
    expect(d.detail).toContain(`paid by the sponsor ${SPONSOR}`);
  });

  test("a verify frame that approves nothing says so", () => {
    const d = frame({
      frames: [
        { mode: "verify", target: null, data: CHECK, value: 0n, gas: 40_000n },
      ],
    });
    expect(d.steps[0]!.label).toContain("verify approving nothing");
    expect(d.steps[0]!.label).not.toContain("execution");
  });

  test("an account's transaction on another chain is warned of", () => {
    expect(frame({ chainId: 100 }).warning).toBe(
      "A frame account's transaction is only sent on the Alt-mempool devnet, not on Gnosis: it will be refused.",
    );
  });

  test("a plain sender's frame transaction says it cannot be sent yet", () => {
    const d = frame({ account: undefined, from: OWNER });
    expect(d.title).toBe(`Frame transaction from ${OWNER}`);
    expect(d.steps).toHaveLength(2);
    expect(d.warning).toBe(
      "A frame transaction from a plain address cannot be sent yet: send it from a frame account (frames:tx --account).",
    );
  });
});
