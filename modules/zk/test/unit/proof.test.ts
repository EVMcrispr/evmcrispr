import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { parseProofJson } from "../../src/utils/proof";
import { CANNED_PROOF_JSON } from "../fixtures/canned-proof";

describe("zk utils > proof", () => {
  const raw = JSON.parse(CANNED_PROOF_JSON) as {
    proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
    publicSignals: string[];
  };

  it("parses a real snarkjs proof and swaps pi_b coordinate pairs", () => {
    const { a, b, c, signals } = parseProofJson(CANNED_PROOF_JSON);
    expect(a).to.deep.equal([
      BigInt(raw.proof.pi_a[0]),
      BigInt(raw.proof.pi_a[1]),
    ]);
    // snarkjs G2 encoding (x.a, x.b) → Solidity pairing order (x.b, x.a).
    expect(b).to.deep.equal([
      [BigInt(raw.proof.pi_b[0][1]), BigInt(raw.proof.pi_b[0][0])],
      [BigInt(raw.proof.pi_b[1][1]), BigInt(raw.proof.pi_b[1][0])],
    ]);
    expect(c).to.deep.equal([
      BigInt(raw.proof.pi_c[0]),
      BigInt(raw.proof.pi_c[1]),
    ]);
    expect(signals).to.deep.equal([33n]);
  });

  it("drops the projective third coordinate of pi_a and pi_c", () => {
    expect(raw.proof.pi_a).to.have.length(3);
    expect(parseProofJson(CANNED_PROOF_JSON).a).to.have.length(2);
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
      '<proof> must be a JSON object with "proof"',
    );
  });

  it("rejects non-groth16 proofs", () => {
    const plonk = JSON.stringify({
      proof: { ...raw.proof, protocol: "plonk" },
      publicSignals: raw.publicSignals,
    });
    expect(() => parseProofJson(plonk)).to.throw(
      "only groth16 proofs are supported",
    );
  });

  it("rejects malformed coordinates", () => {
    const bad = JSON.stringify({
      proof: { ...raw.proof, pi_a: ["xyz", "1", "1"] },
      publicSignals: raw.publicSignals,
    });
    expect(() => parseProofJson(bad)).to.throw("malformed proof coordinate");
  });
});
