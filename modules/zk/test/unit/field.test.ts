import { describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import {
  BN254_PRIME,
  keccakToField,
  parseFieldArray,
  parseFieldInput,
  toField,
} from "../../src/utils/field";
import { FIELD_HASH_0X01 } from "../fixtures";

describe("zk utils > field", () => {
  it("pins the BN254 scalar-field prime", () => {
    expect(BN254_PRIME).to.equal(
      21888242871839275222246405745257275088548364400416034343698204186575808495617n,
    );
  });

  it("reduces values into the field", () => {
    expect(toField(0n)).to.equal(0n);
    expect(toField(BN254_PRIME)).to.equal(0n);
    expect(toField(BN254_PRIME + 5n)).to.equal(5n);
    expect(toField(-1n)).to.equal(BN254_PRIME - 1n);
    expect(toField(-BN254_PRIME)).to.equal(0n);
  });

  it("parses Num, decimal-string and hex inputs", () => {
    expect(parseFieldInput(Num.fromBigInt(7n), "x")).to.equal(7n);
    expect(parseFieldInput("12", "x")).to.equal(12n);
    expect(parseFieldInput("-1", "x")).to.equal(BN254_PRIME - 1n);
    expect(parseFieldInput(`0x${"ff".repeat(32)}`, "x")).to.equal(
      toField(BigInt(`0x${"ff".repeat(32)}`)),
    );
    expect(parseFieldInput(true, "x")).to.equal(1n);
    expect(parseFieldInput(false, "x")).to.equal(0n);
  });

  it("rejects non-integer and malformed inputs", () => {
    for (const bad of ["1.5", "nope", "", {}, [], undefined, null]) {
      expect(() => parseFieldInput(bad, "x")).to.throw(
        "<x> must be a field element",
      );
    }
    expect(() => parseFieldInput(Num("0.5"), "x")).to.throw(
      "<x> must be a field element",
    );
  });

  it("parses arrays and rejects empty ones", () => {
    expect(parseFieldArray(["1", "2"], "leaves")).to.deep.equal([1n, 2n]);
    expect(() => parseFieldArray([], "leaves")).to.throw(
      "<leaves> must be a non-empty array",
    );
    expect(() => parseFieldArray("1", "leaves")).to.throw(
      "<leaves> must be a non-empty array",
    );
  });

  it("hashes bytes into the field with keccak256 mod p", () => {
    expect(keccakToField("0x01")).to.equal(FIELD_HASH_0X01);
    expect(keccakToField("0x01") < BN254_PRIME).to.be.true;
  });
});
