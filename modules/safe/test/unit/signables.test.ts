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
import { buildSafeTx } from "../../src/utils/safeTx";
import {
  collectingSignable,
  mergeSafeSignables,
  messageSignable,
  nestedPayload,
  packContractSignature,
  packedSigners,
  packSignableSigners,
  parseContractSignatureBlob,
  parseSafeSignable,
  reviewSafeSignable,
  serviceSignature,
  signableHashes,
  signableSigners,
  signableTypedData,
  signingBytes,
  transactionSignable,
} from "../../src/utils/signables";

const safe = "0x1111111111111111111111111111111111111111";
const child = "0x2222222222222222222222222222222222222222";
const a = privateKeyToAccount(toHex(1n, { size: 32 }));
const b = privateKeyToAccount(toHex(2n, { size: 32 }));
const base = () =>
  transactionSignable(
    1,
    safe,
    buildSafeTx([{ to: child, value: 10n ** 30n }], 3n),
  );
const sign = (signable: ReturnType<typeof base>, signer = a) =>
  signer.signTypedData(signableTypedData(signable));
describe("Safe signables", () => {
  it("round trips versioned and legacy Safe transactions without losing integer precision", () => {
    const json = JSON.parse(stringifySafeTransaction(base()));
    expect(json.tx.value).toBe("1000000000000000000000000000000");
    expect(parseSafeSignable(json)).toEqual(base());
    delete json.version;
    delete json.kind;
    expect(parseSafeSignable(json)).toEqual(base());
    expect(() => parseSafeSignable({ ...json, version: 2 })).toThrow("version");
    expect(() =>
      parseSafeSignable({ ...json, tx: { ...json.tx, nonce: "4" } }),
    ).toThrow("mismatch");
  });
  it("rejects tampered data at the public review boundary as well as during import", async () => {
    const signable = JSON.parse(stringifySafeTransaction(base()));
    signable.tx.value = "1";
    await expect(reviewSafeSignable(signable)).rejects.toThrow("mismatch");
  });
  it("merges independent EOA signatures deterministically and deduplicates exact copies", async () => {
    const signable = base(),
      sa = await sign(signable),
      sb = await sign(signable, b);
    const one = await mergeSafeSignables(signable, [sa]);
    expect(await mergeSafeSignables(one, [sb, sa])).toEqual(
      await mergeSafeSignables(signable, [sb, one]),
    );
    const other = base();
    if (other.kind === "transaction") other.tx.nonce++;
    const changed = transactionSignable(1, safe, (other as any).tx);
    await expect(mergeSafeSignables(signable, [changed])).rejects.toThrow(
      "different signed payloads",
    );
    await expect(
      mergeSafeSignables(signable, [
        { type: "contract", owner: child, signature: "0x01" },
        { type: "contract", owner: child, signature: "0x02" },
      ]),
    ).rejects.toThrow("conflicting");
  });
  it("packs mixed contract tails with offsets after every static signature", async () => {
    const signable = await mergeSafeSignables(base(), [
      await sign(base()),
      { type: "contract", owner: child, signature: "0x123456" },
    ]);
    const signers = await signableSigners(signable);
    const packed = packSignableSigners(await packedSigners(1, signers));
    const index = signers.findIndex((s) => s.owner === child);
    expect(BigInt(sliceHex(packed, index * 65 + 32, index * 65 + 64))).toBe(
      130n,
    );
    expect(sliceHex(packed, index * 65 + 64, index * 65 + 65)).toBe("0x00");
    expect(BigInt(sliceHex(packed, 130, 162))).toBe(3n);
    expect(sliceHex(packed, 162)).toBe("0x123456");
  });
  it("attaches an owner Safe message only when it signs this item's payload", async () => {
    const signable = base();
    const message = messageSignable(1, child, signingBytes(signable));
    expect(keccak256(signingBytes(message))).toBe(
      hashTypedData(signableTypedData(message)),
    );
    const signed = await mergeSafeSignables(message, [await sign(message)]);
    const merged = await mergeSafeSignables(signable, [signed]);
    expect(merged.signatures[0]).toEqual({
      type: "contract",
      owner: child,
      message: signingBytes(signable),
      signatures: signed.signatures,
    });
    await expect(
      mergeSafeSignables(signable, [
        messageSignable(1, child, toHex(7n, { size: 32 })),
      ]),
    ).rejects.toThrow("different signed payloads");
  });
  it("gives owner Safes the payload their parent's version checks", () => {
    const tx = base();
    // <1.5.0: the EIP-712 preimage; >=1.5.0: the hash.
    expect(nestedPayload(tx, "1.3.0")).toBe(signingBytes(tx));
    expect(nestedPayload(tx, "1.4.1")).toBe(signingBytes(tx));
    expect(nestedPayload(tx, "1.5.0")).toBe(signableHashes(tx).finalHash);
    const message = messageSignable(1, safe, toHex(9n, { size: 32 }));
    // 1.3.0's fallback handler forwards the raw message unencoded.
    expect(nestedPayload(message, "1.3.0")).toBe(toHex(9n, { size: 32 }));
    expect(nestedPayload(message, "1.4.1")).toBe(signingBytes(message));
    expect(nestedPayload(message, "1.5.0")).toBe(
      signableHashes(message).finalHash,
    );
  });
  it("collects owner Safe signatures in turn and packs them once needed", async () => {
    const tx = base();
    const payload = nestedPayload(tx, "1.4.1");
    const inner = messageSignable(1, child, payload);
    const entry = (signer: typeof a) =>
      sign(inner as any, signer).then((sig) => ({
        type: "contract" as const,
        owner: child,
        message: payload,
        signatures: [sig],
      }));
    const signed = await mergeSafeSignables(tx, [await entry(a)]);
    const both = await mergeSafeSignables(signed, [await entry(b)]);
    expect(both.signatures).toHaveLength(1);
    const collected = both.signatures[0] as any;
    expect(collected.signatures).toHaveLength(2);
    const packed = await packContractSignature(1, collected);
    expect(packed).toBe(
      packSignableSigners(
        await packedSigners(
          1,
          await signableSigners(collectingSignable(1, collected)),
        ),
      ),
    );
    // Round trip through the service's contract-signature encoding.
    expect(
      parseContractSignatureBlob(await serviceSignature(1, child, collected)),
    ).toEqual({ type: "contract", owner: child, signature: packed });
    expect(parseSafeSignable(stringifySafeTransaction(both))).toEqual(both);
  });
  it("offline inspection never fetches and reports unknown authorization and calldata", async () => {
    const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network forbidden"),
    );
    try {
      const signable = transactionSignable(
        1,
        safe,
        buildSafeTx([{ to: child, data: "0xabcdef01" }], 0n),
      );
      const report = await reviewSafeSignable(signable);
      expect(report.chain.status).toBe("unchecked");
      expect(report.ready).toBe(false);
      expect((report.decodedCalls[0] as any).decoded.status).toBe("unverified");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("uses current owner membership, threshold, nonce, approvals and the EIP-1271 check of the Safe's version", async () => {
    const signable = await mergeSafeSignables(base(), [
      { type: "contract", owner: child, signature: "0x1234" },
    ]);
    let owners = [child, a.address],
      nonce = 3n,
      magic = "0x20c13b0b",
      approved = 1n,
      threshold = 2n,
      version = "1.3.0";
    const client = {
      readContract: async (r: any) => {
        if (r.functionName === "isValidSignature") {
          // Below 1.5.0 owner Safes get the preimage; from 1.5.0 the hash.
          expect(r.args[0]).toBe(
            version === "1.5.0"
              ? signableHashes(signable).finalHash
              : signingBytes(signable),
          );
          expect(r.account).toBe(safe);
          return magic;
        }
        return (
          {
            VERSION: version,
            getOwners: owners,
            getThreshold: threshold,
            nonce,
            approvedHashes: approved,
          } as any
        )[r.functionName];
      },
    } as unknown as PublicClient;
    expect((await reviewSafeSignable(signable, client)).ready).toBe(true);
    approved = 0n;
    expect((await reviewSafeSignable(signable, client)).readiness).toBe(
      "insufficient-signatures",
    );
    threshold = 1n;
    expect((await reviewSafeSignable(signable, client)).ready).toBe(true);
    nonce = 4n;
    expect((await reviewSafeSignable(signable, client)).readiness).toBe(
      "nonce-consumed",
    );
    nonce = 2n;
    expect((await reviewSafeSignable(signable, client)).readiness).toBe(
      "future-nonce",
    );
    nonce = 3n;
    magic = "0x1626ba7e";
    expect((await reviewSafeSignable(signable, client)).readiness).toBe(
      "invalid-signatures",
    );
    version = "1.5.0";
    expect((await reviewSafeSignable(signable, client)).ready).toBe(true);
    magic = "0x20c13b0b";
    expect((await reviewSafeSignable(signable, client)).readiness).toBe(
      "invalid-signatures",
    );
    version = "1.3.0";
    owners = [a.address];
    expect((await reviewSafeSignable(signable, client)).readiness).toBe(
      "invalid-signatures",
    );
  });
  it("expands known MultiSend calls while retaining unverified inner calldata", async () => {
    const signable = transactionSignable(
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
    const report = await reviewSafeSignable(signable);
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
    const signable = transactionSignable(
      1,
      safe,
      buildSafeTx([{ to: child, data }], 3n),
    );
    const report = await reviewSafeSignable(signable, undefined, {
      [child]: abi,
    });
    expect((report.decodedCalls[0] as any).decoded.signature).toBe(
      "transfer(address,uint256)",
    );
    expect((report.decodedCalls[0] as any).data).toBe(data);
  });
});
