import { describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { parseProveInputs } from "../../src/utils/snarkjs";

describe("zk utils > parseProveInputs", () => {
  it("parses entries arrays", () => {
    expect(
      parseProveInputs([
        ["a", Num.fromBigInt(3n)],
        ["b", Num.fromBigInt(11n)],
      ]),
    ).to.deep.equal({ a: "3", b: "11" });
  });

  it("supports nested arrays for array signals", () => {
    expect(
      parseProveInputs([
        ["root", "123"],
        ["siblings", [Num.fromBigInt(1n), [Num.fromBigInt(2n), "0x0a"]]],
      ]),
    ).to.deep.equal({ root: "123", siblings: ["1", ["2", "10"]] });
  });

  it("converts booleans and hex strings", () => {
    expect(
      parseProveInputs([
        ["flag", true],
        ["addr", "0xff"],
      ]),
    ).to.deep.equal({ flag: "1", addr: "255" });
  });

  it("accepts JSON object strings for interop", () => {
    expect(parseProveInputs('{"a": 3, "b": "11"}')).to.deep.equal({
      a: 3,
      b: "11",
    });
  });

  it("rejects malformed values", () => {
    expect(() => parseProveInputs("not json")).to.throw(
      "entries array like [[a 3] [b 11]] or a JSON object string",
    );
    expect(() => parseProveInputs("[1, 2]")).to.throw("JSON must be an object");
    expect(() => parseProveInputs(42)).to.throw("entries array");
    expect(() => parseProveInputs([["a"]])).to.throw("[name value] pairs");
    expect(() => parseProveInputs([[3, 4]])).to.throw(
      "signal names must be strings",
    );
    expect(() =>
      parseProveInputs([
        ["a", 1],
        ["a", 2],
      ]),
    ).to.throw('duplicate signal "a"');
    expect(() => parseProveInputs([["a", Num("1.5")]])).to.throw(
      'signal "a" has an unsupported value',
    );
  });
});
