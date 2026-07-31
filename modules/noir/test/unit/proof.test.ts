import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { parseProofJson } from "../../src/utils/proof";
import { CANNED_PROOF_JSON } from "../fixtures/assert-circuit";

describe("noir utils > proof", () => {
  it("parses the canned noir:prove output", () => {
    const proof = parseProofJson(CANNED_PROOF_JSON);
    expect(proof.oracle).to.equal("keccak");
    expect(proof.proof).to.match(/^0x[0-9a-f]+$/);
    expect(proof.publicInputs).to.deep.equal([`0x${"5".padStart(64, "0")}`]);
  });

  it("rejects non-JSON and wrong shapes", () => {
    expect(() => parseProofJson("nope")).to.throw("bound by noir:prove");
    expect(() => parseProofJson('{"proof":"0x12"}')).to.throw(
      "bound by noir:prove",
    );
    expect(() =>
      parseProofJson(
        '{"proof":"0x12","publicInputs":["0x1"],"oracle":"keccak"}',
      ),
    ).to.throw("bound by noir:prove");
    expect(() =>
      parseProofJson(
        `{"proof":"0x12","publicInputs":["0x${"0".repeat(64)}"],"oracle":"sha"}`,
      ),
    ).to.throw("bound by noir:prove");
  });
});
