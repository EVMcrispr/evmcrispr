import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  derivePublicKey as zkKitDerive,
  signMessage as zkKitSign,
} from "@zk-kit/eddsa-poseidon";
import {
  derivePublicKey,
  deriveSecretScalar,
  signMessage,
  verifySignature,
} from "../../src/utils/eddsa";
import { BN254_PRIME, randomFieldElement, toBits } from "../../src/utils/field";
import {
  parseCircomSetupOptions,
  parseSystemValue,
} from "../../src/utils/setup";
import { fetchArtifact } from "../../src/utils/snarkjs";
import { parseTreeProofOptions } from "../../src/utils/tree";
import { FIELD_HASH_0X01 } from "../fixtures";

describe("zk utils > phase 3", () => {
  describe("randomFieldElement", () => {
    it("stays inside the field and varies", () => {
      const seen = new Set<bigint>();
      for (let i = 0; i < 32; i++) {
        const value = randomFieldElement();
        expect(value < BN254_PRIME).to.be.true;
        expect(value >= 0n).to.be.true;
        seen.add(value);
      }
      expect(seen.size).to.equal(32);
    });
  });

  describe("toBits", () => {
    it("decomposes LSB-first", () => {
      expect(toBits(5n, 4)).to.deep.equal([1n, 0n, 1n, 0n]);
      expect(toBits(0n, 3)).to.deep.equal([0n, 0n, 0n]);
    });

    it("rejects values that do not fit", () => {
      expect(() => toBits(8n, 3)).to.throw("does not fit in 3 bits");
      expect(() => toBits(1n, 0)).to.throw("<count> must be between 1 and 254");
    });
  });

  describe("eddsa", () => {
    it("cross-checks against @zk-kit/eddsa-poseidon", async () => {
      const secret = "correct horse battery staple";
      const [x, y] = await derivePublicKey(secret);
      const reference = zkKitDerive(secret);
      expect([x, y]).to.deep.equal([
        BigInt(reference[0]),
        BigInt(reference[1]),
      ]);
      const { r8, s } = await signMessage(secret, 42n);
      const referenceSig = zkKitSign(secret, 42n);
      expect(r8).to.deep.equal([
        BigInt(referenceSig.R8[0]),
        BigInt(referenceSig.R8[1]),
      ]);
      expect(s).to.equal(BigInt(referenceSig.S));
    });

    it("derives the secret scalar consistently with the public key", async () => {
      const scalar = await deriveSecretScalar("my seed");
      expect(scalar > 0n).to.be.true;
      // Same derivation twice is stable; different seeds diverge.
      expect(await deriveSecretScalar("my seed")).to.equal(scalar);
      expect(await deriveSecretScalar("other seed")).to.not.equal(scalar);
    });

    it("round-trips and rejects tampered signatures", async () => {
      const secret = "seed";
      const pub = await derivePublicKey(secret);
      const { r8, s } = await signMessage(secret, FIELD_HASH_0X01);
      expect(await verifySignature(FIELD_HASH_0X01, r8, s, pub)).to.be.true;
      expect(await verifySignature(FIELD_HASH_0X01 + 1n, r8, s, pub)).to.be
        .false;
      expect(await verifySignature(FIELD_HASH_0X01, r8, s + 1n, pub)).to.be
        .false;
    });
  });

  describe("setup options", () => {
    it("parses system options", () => {
      expect(parseCircomSetupOptions(["system:plonk"]).system).to.equal(
        "plonk",
      );
      expect(parseCircomSetupOptions([]).system).to.equal("groth16");
      expect(
        parseCircomSetupOptions(["ptau:dev", "system:fflonk"]),
      ).to.deep.equal({ ptau: { kind: "dev" }, system: "fflonk" });
      expect(() => parseSystemValue("stark")).to.throw(
        'unknown proof system "stark"',
      );
      expect(() => parseCircomSetupOptions(["system:stark"])).to.throw(
        "unknown proof system",
      );
    });
  });

  describe("tree proof options", () => {
    it("parses mode + pad combinations", () => {
      expect(parseTreeProofOptions([])).to.deep.equal({
        mode: { kind: "lean" },
        pad: undefined,
      });
      expect(parseTreeProofOptions(["pad:10"])).to.deep.equal({
        mode: { kind: "lean" },
        pad: 10,
      });
      expect(parseTreeProofOptions(["lean", "pad:20"]).pad).to.equal(20);
      expect(() => parseTreeProofOptions(["depth:4", "pad:8"])).to.throw(
        "pad only applies to lean trees",
      );
      expect(() => parseTreeProofOptions(["pad:0"])).to.throw(
        "pad must be between",
      );
      expect(() => parseTreeProofOptions(["nonsense"])).to.throw(
        '<options> must be "lean", "depth:<n>" or "pad:<n>"',
      );
    });
  });

  describe("artifact integrity pins", () => {
    it("accepts a matching sha256 fragment and rejects a wrong one", async () => {
      const body = Buffer.from("hello zk").toString("base64");
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", Buffer.from("hello zk")),
      );
      const hex = `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
      const { server } = await import("../setup");
      const { HttpResponse, http } = await import(
        "@evmcrispr/test-utils/msw/server"
      );
      server.use(
        http.get("https://zk.test/pinned.bin", () =>
          HttpResponse.arrayBuffer(Buffer.from(body, "base64").buffer),
        ),
      );
      const good = await fetchArtifact(
        `https://zk.test/pinned.bin#sha256=${hex}`,
        "artifact",
        {},
      );
      expect(Buffer.from(good).toString()).to.equal("hello zk");
      let message = "";
      await fetchArtifact(
        `https://zk.test/pinned.bin#sha256=0x${"00".repeat(32)}`,
        "artifact",
        {},
      ).catch((err) => {
        message = err.message;
      });
      expect(message).to.include("failed its integrity check");
    });
  });
});
