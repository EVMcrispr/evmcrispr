import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { parseNoirInputs } from "../../src/utils/inputs";

describe("noir utils > inputs", () => {
  it("parses entries arrays", () => {
    expect(parseNoirInputs([["x", 3], ["y", "5"]])).to.deep.equal({
      x: "3",
      y: "5",
    });
  });

  it("keeps booleans and hex strings for the ABI encoder", () => {
    expect(parseNoirInputs([["flag", true], ["h", "0xff"]])).to.deep.equal({
      flag: true,
      h: "0xff",
    });
  });

  it("nests array inputs", () => {
    expect(parseNoirInputs([["xs", [1, 2, 3]]])).to.deep.equal({
      xs: ["1", "2", "3"],
    });
  });

  it("parses JSON object strings (struct inputs)", () => {
    expect(parseNoirInputs('{"p": {"x": "1", "y": "2"}}')).to.deep.equal({
      p: { x: "1", y: "2" },
    });
  });

  it("rejects non-object JSON", () => {
    expect(() => parseNoirInputs("[1, 2]")).to.throw(
      "--inputs JSON must be an object",
    );
    expect(() => parseNoirInputs("nope")).to.throw(
      "must be an entries array",
    );
  });

  it("rejects malformed entries", () => {
    expect(() => parseNoirInputs([["x"]])).to.throw("[name value] pairs");
    expect(() => parseNoirInputs([[3, 1]])).to.throw("names must be strings");
    expect(() => parseNoirInputs([["x", 1], ["x", 2]])).to.throw(
      'duplicate input "x"',
    );
    expect(() => parseNoirInputs([["x", 1.5]])).to.throw(
      "unsupported value",
    );
  });
});
