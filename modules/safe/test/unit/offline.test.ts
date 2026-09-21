import { describe, expect, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { concatHex, type Hex, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  exportSafeTransaction,
  importSafeTransaction,
  normalizeSafeSignature,
  packSafeSignatures,
  safeUint,
} from "../../src/utils/offline";
import {
  buildSafeTx,
  getSafeTxTypedData,
  hashSafeTx,
} from "../../src/utils/safeTx";

const safe = "0x1111111111111111111111111111111111111111";
const accounts = [1n, 2n, 3n].map((key) =>
  privateKeyToAccount(toHex(key, { size: 32 })),
);
const owners = accounts.slice(0, 2).map((a) => a.address);
const tx = buildSafeTx([{ to: safe, value: 10n ** 24n, data: "0x1234" }], 42n);
const hash = hashSafeTx(1, safe, tx);
const sign = (i: number) =>
  accounts[i].signTypedData(getSafeTxTypedData(1, safe, tx));

describe("Safe > portable transactions", () => {
  it("round-trips exact large integers and signatures", async () => {
    const signatures = [await sign(0)];
    const json = exportSafeTransaction(1, safe, tx, signatures);
    expect(importSafeTransaction(json, 1, safe)).toEqual({ tx, signatures });
    expect(JSON.parse(json).tx.value).toBe("1000000000000000000000000");
  });

  it("rejects a different chain, Safe, or tampered payload", () => {
    const json = exportSafeTransaction(1, safe, tx, []);
    expect(() => importSafeTransaction(json, 2, safe)).toThrow("chainId");
    expect(() => importSafeTransaction(json, 1, owners[0])).toThrow(
      "belongs to Safe",
    );
    const data = JSON.parse(json);
    data.tx.value = "1";
    expect(() => importSafeTransaction(JSON.stringify(data), 1, safe)).toThrow(
      "safeTxHash mismatch",
    );
  });

  it("rejects missing, malformed, out-of-range, or lossy fields", () => {
    for (const [key, value] of [
      ["nonce", -1],
      ["nonce", 1.5],
      ["value", Number.MAX_SAFE_INTEGER + 1],
      ["value", (1n << 256n).toString()],
      ["safeTxGas", undefined],
      ["operation", 2],
      ["operation", "0"],
      ["to", "bad"],
      ["data", "0x1"],
    ]) {
      const data = JSON.parse(exportSafeTransaction(1, safe, tx, []));
      data.tx[key as string] = value;
      expect(() =>
        importSafeTransaction(JSON.stringify(data), 1, safe),
      ).toThrow();
    }
    for (const value of [null, [], {}, 42, hash]) {
      expect(() =>
        importSafeTransaction(JSON.stringify(value), 1, safe),
      ).toThrow();
    }
    expect(() => safeUint(Num("1.5"), "nonce")).toThrow("unsigned integer");
  });

  it("recovers and sorts owners rather than trusting input order", async () => {
    const signatures = await Promise.all([sign(0), sign(1)]);
    const expected = owners
      .map((owner, i) => ({ owner, signature: signatures[i] }))
      .sort((a, b) =>
        a.owner.toLowerCase().localeCompare(b.owner.toLowerCase()),
      );
    expect(
      await packSafeSignatures(hash, signatures.reverse(), owners, 2n),
    ).toBe(concatHex(expected.map((s) => s.signature)));
  });

  it("rejects duplicate, non-owner, wrong-transaction and insufficient signatures", async () => {
    const signature = await sign(0);
    await expect(
      packSafeSignatures(hash, [signature, signature], owners, 2n),
    ).rejects.toThrow("duplicate");
    await expect(
      packSafeSignatures(hash, [await sign(2)], owners, 1n),
    ).rejects.toThrow("not a current owner");
    await expect(
      packSafeSignatures(
        hashSafeTx(1, safe, { ...tx, nonce: 43n }),
        [signature],
        owners,
        1n,
      ),
    ).rejects.toThrow("not a current owner");
    await expect(
      packSafeSignatures(hash, [signature], owners, 2n),
    ).rejects.toThrow("1 of 2");
  });

  it("normalizes wallet recovery bits and rejects unsupported signatures", async () => {
    const signature = await sign(0);
    const recoveryBit = (Number.parseInt(signature.slice(-2), 16) - 27)
      .toString(16)
      .padStart(2, "0");
    expect(
      normalizeSafeSignature(`${signature.slice(0, -2)}${recoveryBit}`),
    ).toBe(signature);
    for (const bad of [
      "0x",
      "0xgg",
      `${signature.slice(0, -2)}1f`,
      `${signature}00`,
    ]) {
      expect(() => normalizeSafeSignature(bad as Hex)).toThrow();
    }
  });
});
