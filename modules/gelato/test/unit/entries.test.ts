import { describe, expect, it } from "bun:test";
import { decodeAbiParameters } from "viem";
import {
  encodeUserArgs,
  parseEntries,
  parseUserArgsSchema,
} from "../../src/utils/entries";

describe("gelato > entries", () => {
  it("parses [name value] pairs and rejects duplicates", () => {
    expect(
      parseEntries(
        [
          ["a", 1],
          ["b", "x"],
        ],
        "--args",
      ),
    ).toEqual([
      ["a", 1],
      ["b", "x"],
    ]);
    expect(() =>
      parseEntries(
        [
          ["a", 1],
          ["a", 2],
        ],
        "--args",
      ),
    ).toThrow("duplicate");
    expect(() => parseEntries([["a"]], "--args")).toThrow("[name value]");
    expect(() => parseEntries("nope", "--args")).toThrow("entries array");
  });

  it("validates schema types against Gelato's set", () => {
    expect(
      parseUserArgsSchema(
        [
          ["vault", "string"],
          ["ids", "number[]"],
        ],
        "--user-args",
      ),
    ).toEqual({ vault: "string", ids: "number[]" });
    expect(() =>
      parseUserArgsSchema([["vault", "address"]], "--user-args"),
    ).toThrow("expected one of");
  });

  it("ABI-encodes values in schema order like automate-sdk", () => {
    const schema = parseUserArgsSchema(
      [
        ["vault", "string"],
        ["threshold", "number"],
        ["flags", "boolean[]"],
      ],
      "--user-args",
    );
    const { hex, json } = encodeUserArgs(schema, [
      ["flags", [true, "false"]],
      ["vault", "0xabc"],
      ["threshold", 100],
    ]);
    expect(
      decodeAbiParameters(
        [{ type: "string" }, { type: "uint256" }, { type: "bool[]" }],
        hex,
      ),
    ).toEqual(["0xabc", 100n, [true, false]]);
    expect(json).toEqual({
      vault: "0xabc",
      threshold: "100",
      flags: [true, false],
    });
  });

  it("reports missing and unknown user args", () => {
    const schema = parseUserArgsSchema([["vault", "string"]], "--user-args");
    expect(() => encodeUserArgs(schema, [])).toThrow("missing user arg vault");
    expect(() =>
      encodeUserArgs(schema, [
        ["vault", "x"],
        ["extra", 1],
      ]),
    ).toThrow('unknown user arg "extra"');
    expect(encodeUserArgs({}, []).hex).toBe("0x");
  });
});
