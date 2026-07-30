import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { parseProofJson, parseZkeyProtocol } from "../../src/utils/proof";
import {
  CANNED_PLONK_CALLDATA,
  CANNED_PLONK_PROOF_JSON,
  CANNED_PROOF_CALLDATA,
  CANNED_PROOF_JSON,
} from "../fixtures/canned-proof";
import {
  MULTIPLIER2_PLONK_ZKEY_B64,
  MULTIPLIER2_ZKEY_B64,
} from "../fixtures/multiplier2";

/** Flatten a snarkjs exportSolidityCallData string into bigints. */
const flattenCalldata = (calldata: string): bigint[] =>
  (JSON.parse(`[${calldata.replaceAll("][", "],[")}]`) as unknown[])
    .flat(3)
    .map((v) => BigInt(v as string));

describe("zk utils > proof", () => {
  const raw = JSON.parse(CANNED_PROOF_JSON) as {
    proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
    publicSignals: string[];
  };

  it("matches snarkjs's own groth16 calldata export (incl. the pi_b swap)", () => {
    const parsed = parseProofJson(CANNED_PROOF_JSON);
    if (parsed.protocol !== "groth16") throw new Error("expected groth16");
    const mine = [
      ...parsed.a,
      ...parsed.b.flat(),
      ...parsed.c,
      ...parsed.signals,
    ];
    expect(mine).to.deep.equal(flattenCalldata(CANNED_PROOF_CALLDATA));
  });

  it("drops the projective third coordinate of pi_a and pi_c", () => {
    const parsed = parseProofJson(CANNED_PROOF_JSON);
    if (parsed.protocol !== "groth16") throw new Error("expected groth16");
    expect(raw.proof.pi_a).to.have.length(3);
    expect(parsed.a).to.have.length(2);
  });

  it("matches snarkjs's own plonk calldata export", () => {
    const parsed = parseProofJson(CANNED_PLONK_PROOF_JSON);
    if (parsed.protocol !== "plonk") throw new Error("expected plonk");
    expect(parsed.proof).to.have.length(24);
    expect([...parsed.proof, ...parsed.signals]).to.deep.equal(
      flattenCalldata(CANNED_PLONK_CALLDATA),
    );
  });

  it("rejects non-string and malformed inputs", () => {
    expect(() => parseProofJson(42)).to.throw(
      "<proof> must be the JSON string bound by zk:prove",
    );
    expect(() => parseProofJson("not json")).to.throw(
      "<proof> is not valid JSON",
    );
    expect(() => parseProofJson('{"hello": 1}')).to.throw(
      '<proof> must be a JSON object with "proof"',
    );
    expect(() => parseProofJson('{"proof": {}, "publicSignals": []}')).to.throw(
      "missing groth16 proof points",
    );
  });

  it("rejects unsupported protocols and mismatched shapes", () => {
    const withProtocol = (protocol: string) =>
      JSON.stringify({
        proof: { protocol },
        publicSignals: raw.publicSignals,
      });
    expect(() => parseProofJson(withProtocol("stark"))).to.throw(
      "supported protocols: groth16, plonk, fflonk",
    );
    expect(() => parseProofJson(withProtocol("plonk"))).to.throw(
      "missing plonk proof point A",
    );
    expect(() => parseProofJson(withProtocol("fflonk"))).to.throw(
      "missing fflonk polynomials",
    );
  });

  it("rejects malformed coordinates", () => {
    const bad = JSON.stringify({
      proof: { ...raw.proof, pi_a: ["xyz", "1", "1"] },
      publicSignals: raw.publicSignals,
    });
    expect(() => parseProofJson(bad)).to.throw("malformed proof coordinate");
  });

  describe("parseZkeyProtocol", () => {
    it("detects groth16 and plonk zkeys", () => {
      expect(
        parseZkeyProtocol(Buffer.from(MULTIPLIER2_ZKEY_B64, "base64")),
      ).to.equal("groth16");
      expect(
        parseZkeyProtocol(Buffer.from(MULTIPLIER2_PLONK_ZKEY_B64, "base64")),
      ).to.equal("plonk");
    });

    it("rejects malformed zkeys", () => {
      expect(() => parseZkeyProtocol(new Uint8Array([1, 2, 3]))).to.throw(
        "malformed zkey",
      );
    });
  });
});
