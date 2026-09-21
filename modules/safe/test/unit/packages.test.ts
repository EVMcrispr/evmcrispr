import { describe, expect, it, spyOn } from "bun:test";
import {
  encodeFunctionData,
  hashTypedData,
  keccak256,
  type PublicClient,
  parseAbi,
  sliceHex,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { stringifySafeTransaction } from "../../src/utils/offline";
import {
  mergeSafePackages,
  messagePackage,
  packageHashes,
  packageSigners,
  packageTypedData,
  packPackageSigners,
  parseSafePackage,
  reviewSafePackage,
  signingBytes,
  transactionPackage,
} from "../../src/utils/packages";
import { buildSafeTx } from "../../src/utils/safeTx";

const safe = "0x1111111111111111111111111111111111111111";
const child = "0x2222222222222222222222222222222222222222";
const a = privateKeyToAccount(toHex(1n, { size: 32 }));
const b = privateKeyToAccount(toHex(2n, { size: 32 }));
const base = () =>
  transactionPackage(
    1,
    safe,
    buildSafeTx([{ to: child, value: 10n ** 30n }], 3n),
  );
const sign = (pkg: ReturnType<typeof base>, signer = a) =>
  signer.signTypedData(packageTypedData(pkg));
describe("Safe local packages", () => {
  it("round trips versioned and legacy packages without losing integer precision", () => {
    const json = JSON.parse(stringifySafeTransaction(base()));
    expect(json.tx.value).toBe("1000000000000000000000000000000");
    expect(parseSafePackage(json)).toEqual(base());
    delete json.version;
    delete json.kind;
    expect(parseSafePackage(json)).toEqual(base());
    expect(() => parseSafePackage({ ...json, version: 2 })).toThrow("version");
    expect(() =>
      parseSafePackage({ ...json, tx: { ...json.tx, nonce: "4" } }),
    ).toThrow("mismatch");
  });
  it("rejects tampered data at the public review boundary as well as during import", async () => {
    const pkg = JSON.parse(stringifySafeTransaction(base()));
    pkg.tx.value = "1";
    await expect(reviewSafePackage(pkg)).rejects.toThrow("mismatch");
  });
  it("merges independent EOA signatures deterministically and deduplicates exact copies", async () => {
    const pkg = base(),
      sa = await sign(pkg),
      sb = await sign(pkg, b);
    const one = await mergeSafePackages(pkg, [sa]);
    expect(await mergeSafePackages(one, [sb, sa])).toEqual(
      await mergeSafePackages(pkg, [sb, one]),
    );
    const other = base();
    if (other.kind === "transaction") other.tx.nonce++;
    const changed = transactionPackage(1, safe, (other as any).tx);
    await expect(mergeSafePackages(pkg, [changed])).rejects.toThrow(
      "different signed payloads",
    );
    await expect(
      mergeSafePackages(pkg, [
        { type: "contract", owner: child, signature: "0x01" },
        { type: "contract", owner: child, signature: "0x02" },
      ]),
    ).rejects.toThrow("conflicting");
  });
  it("packs mixed contract tails with offsets after every static signature", async () => {
    const pkg = await mergeSafePackages(base(), [
      await sign(base()),
      { type: "contract", owner: child, signature: "0x123456" },
    ]);
    const signers = await packageSigners(pkg);
    const packed = packPackageSigners(signers);
    const index = signers.findIndex((s) => s.owner === child);
    expect(BigInt(sliceHex(packed, index * 65 + 32, index * 65 + 64))).toBe(
      130n,
    );
    expect(sliceHex(packed, index * 65 + 64, index * 65 + 65)).toBe("0x00");
    expect(BigInt(sliceHex(packed, 130, 162))).toBe(3n);
    expect(sliceHex(packed, 162)).toBe("0x123456");
  });
  it("attaches nested signatures only for the exact parent signing bytes", async () => {
    const pkg = base();
    const message = messagePackage(1, child, signingBytes(pkg), "bytes");
    expect(keccak256(signingBytes(message))).toBe(
      hashTypedData(packageTypedData(message)),
    );
    const signed = await mergeSafePackages(message, [await sign(message)]);
    const merged = await mergeSafePackages(pkg, [signed]);
    expect(merged.signatures[0]).toEqual({
      type: "contract",
      owner: child,
      signature: packPackageSigners(await packageSigners(signed)),
    });
    await expect(
      mergeSafePackages(pkg, [
        messagePackage(1, child, packageHashes(pkg).finalHash, "bytes"),
      ]),
    ).rejects.toThrow("different signed payloads");
  });
  it("offline inspection never fetches and reports unknown authorization and calldata", async () => {
    const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network forbidden"),
    );
    try {
      const pkg = transactionPackage(
        1,
        safe,
        buildSafeTx([{ to: child, data: "0xabcdef01" }], 0n),
      );
      const report = await reviewSafePackage(pkg);
      expect(report.chain.status).toBe("unchecked");
      expect(report.ready).toBe(false);
      expect((report.decodedCalls[0] as any).decoded.status).toBe("unverified");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("uses current owner membership, threshold, nonce, approvals and legacy contract magic", async () => {
    const pkg = await mergeSafePackages(base(), [
      { type: "contract", owner: child, signature: "0x1234" },
    ]);
    let owners = [child, a.address],
      nonce = 3n,
      magic = "0x20c13b0b",
      approved = 1n,
      threshold = 2n;
    const client = {
      readContract: async (r: any) => {
        if (r.functionName === "isValidSignature") {
          expect(r.args[0]).toBe(signingBytes(pkg));
          expect(r.account).toBe(safe);
          return magic;
        }
        return (
          {
            VERSION: "1.3.0",
            getOwners: owners,
            getThreshold: threshold,
            nonce,
            approvedHashes: approved,
          } as any
        )[r.functionName];
      },
    } as unknown as PublicClient;
    expect((await reviewSafePackage(pkg, client)).ready).toBe(true);
    approved = 0n;
    expect((await reviewSafePackage(pkg, client)).readiness).toBe(
      "insufficient-signatures",
    );
    threshold = 1n;
    expect((await reviewSafePackage(pkg, client)).ready).toBe(true);
    nonce = 4n;
    expect((await reviewSafePackage(pkg, client)).readiness).toBe(
      "nonce-consumed",
    );
    nonce = 2n;
    expect((await reviewSafePackage(pkg, client)).readiness).toBe(
      "future-nonce",
    );
    nonce = 3n;
    magic = "0x1626ba7e";
    expect((await reviewSafePackage(pkg, client)).readiness).toBe(
      "invalid-signatures",
    );
    magic = "0x20c13b0b";
    owners = [a.address];
    expect((await reviewSafePackage(pkg, client)).readiness).toBe(
      "invalid-signatures",
    );
  });
  it("expands known MultiSend calls while retaining unverified inner calldata", async () => {
    const pkg = transactionPackage(
      1,
      safe,
      buildSafeTx(
        [
          { to: child, value: 7n },
          { to: child, data: "0xdeadbeef" },
        ],
        3n,
      ),
    );
    const report = await reviewSafePackage(pkg);
    const decoded = (report.decodedCalls[0] as any).decoded;
    expect(decoded.signature).toBe("multiSend(bytes)");
    expect(decoded.calls).toHaveLength(2);
    expect(decoded.calls[0].value).toBe(7n);
    expect(decoded.calls[1].decoded.status).toBe("unverified");
  });
  it("decodes with explicit ABIs and exposes the original calldata", async () => {
    const abi = parseAbi(["function transfer(address,uint256)"]);
    const data = encodeFunctionData({
      abi,
      functionName: "transfer",
      args: [safe, 10n ** 30n],
    });
    const pkg = transactionPackage(
      1,
      safe,
      buildSafeTx([{ to: child, data }], 3n),
    );
    const report = await reviewSafePackage(pkg, undefined, { [child]: abi });
    expect((report.decodedCalls[0] as any).decoded.signature).toBe(
      "transfer(address,uint256)",
    );
    expect((report.decodedCalls[0] as any).data).toBe(data);
  });
});
