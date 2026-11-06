import { describe, expect, test } from "bun:test";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, sigHash, signTx } from "@forshtat/hegota-support/tx";
import {
  keccak256,
  parseSignature,
  recoverAddress,
  serializeTransaction,
  sliceHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  call,
  type Frame,
  type FrameTransactionSerializable,
  frameSerializer,
  parseFrameTransaction,
  selfVerify,
  serializeFrameTransaction,
  toFrameTx,
} from "../../src";

// Anvil's first well-known test key: never holds value on any real chain.
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(KEY);
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";

const tx: FrameTransactionSerializable = {
  type: "frame",
  chainId: 1337,
  from: account.address,
  nonce: 7,
  frames: [
    selfVerify() as Frame,
    {
      ...call({ to: RECIPIENT, value: 1_000_000_000n }),
      limits: { execution: 50_000n, state: 200_000n },
    },
  ],
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
};

describe("serializeFrameTransaction", () => {
  test("unsigned, it is the encoding the signature hash is taken over", () => {
    expect(keccak256(serializeFrameTransaction(tx))).toBe(
      sigHash(profile, toFrameTx(tx)),
    );
  });

  test("a viem local account signs it to the same bytes as the library", async () => {
    const viaViem = await account.signTransaction(tx as never, {
      serializer: frameSerializer(),
    });
    const viaLibrary = encodeTx(
      profile,
      await signTx(profile, toFrameTx(tx), KEY),
    );
    expect(viaViem).toBe(viaLibrary);
  });

  test("the signature recovers to the sender", async () => {
    const raw = await account.signTransaction(tx as never, {
      serializer: frameSerializer(),
    });
    const decoded = parseFrameTransaction(raw);
    const packed = decoded.signatures[0]!.signature;
    expect(packed.length).toBe(2 + 65 * 2);
    const v = Number(sliceHex(packed, 0, 1));
    expect([0, 1]).toContain(v);
    const signature = parseSignature(
      `${sliceHex(packed, 1)}${v === 0 ? "1b" : "1c"}`,
    );
    const signer = await recoverAddress({
      hash: sigHash(profile, decoded),
      signature,
    });
    expect(signer).toBe(account.address);
  });

  test("decoding gives back the transaction", () => {
    const decoded = parseFrameTransaction(serializeFrameTransaction(tx));
    expect(decoded.sender).toBe(account.address);
    expect(decoded.nonceKeys).toEqual([0n]);
    expect(decoded.nonceSeq).toBe(7n);
    expect(decoded.frames).toEqual(toFrameTx(tx).frames);
    expect(decoded.fees.maxFeePerGas).toBe(2_000_000_000n);
  });

  test("other transaction types go through viem", () => {
    const eip1559 = {
      type: "eip1559",
      chainId: 1,
      nonce: 0,
      to: RECIPIENT,
      value: 1n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      gas: 21_000n,
    } as const;
    expect(frameSerializer()(eip1559)).toBe(serializeTransaction(eip1559));
  });
});
