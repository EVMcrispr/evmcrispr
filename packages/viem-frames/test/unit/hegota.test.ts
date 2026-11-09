import { describe, expect, test } from "bun:test";
import { profile as libraryHegota } from "@forshtat/hegota-support/profiles/ethrex-hegota-devnet";
import {
  decodeTx,
  encodeTx,
  newTx,
  secp256k1Placeholder,
} from "@forshtat/hegota-support/tx";
import {
  eip8141TracerProfile,
  ethrexHegotaDevnetProfile,
  type FrameSpecLike,
  frameProfileOf,
  frameSidecarOf,
  hegotaDevnet,
  toFrameRequests,
} from "../../src";

const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const frames: FrameSpecLike[] = [
  {
    mode: "verify",
    approve: "both",
    target: null,
    data: "0x",
    value: 0n,
    gas: 30_000n,
  },
  {
    mode: "sender",
    atomic: true,
    target: DEAD,
    data: "0x",
    value: 1n,
    gas: 50_000n,
    stateGas: 200_000n,
  },
  {
    mode: "sender",
    target: DEAD,
    data: "0x",
    value: 2n,
    gas: 50_000n,
    stateGas: 200_000n,
  },
];

describe("the Hegota devnet", () => {
  test("is chain 3151908 on a plain node, with its own profile", () => {
    expect(hegotaDevnet.id).toBe(3151908);
    expect(frameSidecarOf(hegotaDevnet)).toBe(false);
    expect(frameProfileOf(hegotaDevnet)).toBe(ethrexHegotaDevnetProfile);
  });

  test("its profile has the atomic flag the chain honours; the library's has none", () => {
    expect(ethrexHegotaDevnetProfile.flagBits.ATOMIC_BATCH).toBe(0x4);
    expect(toFrameRequests(frames, ethrexHegotaDevnetProfile)[1]!.flags).toBe(
      0x4,
    );
    expect(() => toFrameRequests(frames, libraryHegota)).toThrow(
      "The frame profile has no atomic batch flag",
    );
  });

  test("a transaction is laid out with the three fees as their own items, unlike the tracer devnets", () => {
    const tx = (profile: typeof ethrexHegotaDevnetProfile) =>
      newTx({
        chainId: 3151908,
        sender: SENDER,
        nonceSeq: 3n,
        frames: toFrameRequests(frames, profile) as never,
        signatures: [secp256k1Placeholder(profile)],
        fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
      });
    const hegota = encodeTx(
      ethrexHegotaDevnetProfile,
      tx(ethrexHegotaDevnetProfile),
    );
    expect(hegota).not.toBe(
      encodeTx(eip8141TracerProfile, tx(eip8141TracerProfile)),
    );
    const decoded = decodeTx(ethrexHegotaDevnetProfile, hegota);
    expect(decoded.fees.maxFeePerGas).toBe(1_000n);
    expect(decoded.fees.maxPriorityFeePerGas).toBe(1n);
    expect(decoded.frames[1]!.flags).toBe(0x4);
  });
});
