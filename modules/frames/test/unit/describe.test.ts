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

  test("a transaction on a chain outside the frame networks is warned of, for both senders", () => {
    const warning =
      "Frame transactions are sent on the Alt-mempool devnet, the Frames quick devnet, the Frames mining devnet, the Frames alt-mempool devnet or the Hegota devnet, not on Gnosis: it will be refused.";
    expect(frame({ chainId: 100 }).warning).toBe(warning);
    expect(
      frame({ chainId: 100, account: undefined, from: OWNER }).warning,
    ).toBe(warning);
  });

  test("the alt mempool on a network without one is warned of", () => {
    expect(frame({ chainId: 81412 }).warning).toBe(
      "The Frames mining devnet has no alt mempool: it will be refused (write `--mempool canonical`).",
    );
    expect(
      frame({ chainId: 81412, mempool: "canonical" }).warning,
    ).toBeUndefined();
  });

  test("a plain sender's frame transaction says its wallet is asked eth_signTransaction", () => {
    const d = frame({ account: undefined, from: OWNER });
    expect(d.title).toBe(`Frame transaction from ${OWNER}`);
    expect(d.steps).toHaveLength(2);
    expect(d.warning).toBeUndefined();
    expect(d.notes).toEqual([
      `When it is sent, the wallet of the sender ${OWNER} is asked to sign it as a type 0x06 transaction (eth_signTransaction), with the nonce and fees filled in; a wallet that does not sign frame transactions refuses it.`,
    ]);
  });
});
