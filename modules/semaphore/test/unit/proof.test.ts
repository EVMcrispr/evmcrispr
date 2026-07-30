import { describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import {
  artifactUrls,
  buildProofJson,
  hashSignal,
  packPoints,
  parseProofJson,
  parseSignalValue,
} from "../../src/utils/proof";
import { HASHED_42, TEXT_SIGNAL_TEST_POLL } from "../fixtures/vectors";

describe("semaphore utils > proof", () => {
  it("hashes signals like the contract (keccak >> 8)", () => {
    expect(hashSignal(42n)).to.equal(HASHED_42);
    // Always fits the snark scalar field (254 bits).
    expect(hashSignal(0n) >> 248n).to.equal(0n);
  });

  it("parses signal values with reference-SDK semantics", () => {
    expect(parseSignalValue(Num.fromBigInt(42n), "x")).to.equal(42n);
    expect(parseSignalValue("42", "x")).to.equal(42n);
    expect(parseSignalValue("0x2a", "x")).to.equal(42n);
    expect(parseSignalValue("test-poll", "x")).to.equal(TEXT_SIGNAL_TEST_POLL);
    expect(parseSignalValue(true, "x")).to.equal(1n);
    expect(() => parseSignalValue("", "x")).to.throw("must not be empty");
    expect(() => parseSignalValue(Num("1.5"), "x")).to.throw(
      "must be a number",
    );
  });

  it("builds pinned artifact URLs and validates depth", () => {
    expect(artifactUrls(2).wasm).to.equal(
      "https://snark-artifacts.pse.dev/semaphore/4.13.0/semaphore-2.wasm",
    );
    expect(artifactUrls(32).zkey).to.include("semaphore-32.zkey");
    expect(() => artifactUrls(0)).to.throw("between 1 and 32");
    expect(() => artifactUrls(33)).to.throw("between 1 and 32");
  });

  it("packs groth16 points in zk-kit order (pi_b swapped)", () => {
    const proof = {
      pi_a: ["1", "2", "1"],
      pi_b: [
        ["3", "4"],
        ["5", "6"],
        ["1", "0"],
      ],
      pi_c: ["7", "8", "1"],
    };
    expect(packPoints(proof)).to.deep.equal([1n, 2n, 4n, 3n, 6n, 5n, 7n, 8n]);
  });

  it("round-trips proof JSON and rejects malformed values", () => {
    const json = buildProofJson({
      merkleTreeDepth: 2n,
      merkleTreeRoot: 3n,
      nullifier: 4n,
      message: 42n,
      scope: TEXT_SIGNAL_TEST_POLL,
      points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
    });
    const parsed = parseProofJson(json);
    expect(parsed.merkleTreeDepth).to.equal(2n);
    expect(parsed.scope).to.equal(TEXT_SIGNAL_TEST_POLL);
    expect(parsed.points).to.have.length(8);
    expect(() => parseProofJson(42)).to.throw("must be the proof JSON");
    expect(() => parseProofJson("nope")).to.throw("not valid JSON");
    expect(() => parseProofJson('{"merkleTreeDepth": "1"}')).to.throw(
      'missing "merkleTreeRoot"',
    );
    expect(() =>
      parseProofJson(json.replace(/"points":\[[^\]]*\]/, '"points":["1","2"]')),
    ).to.throw("exactly 8 proof points");
  });
});
