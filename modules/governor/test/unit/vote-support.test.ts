import { describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { resolveVoteSupport } from "../../src/argTypes";

describe("Governor > unit > resolveVoteSupport", () => {
  it("maps names to Governor support values", () => {
    expect(resolveVoteSupport("against")).to.equal(0);
    expect(resolveVoteSupport("for")).to.equal(1);
    expect(resolveVoteSupport("abstain")).to.equal(2);
    expect(resolveVoteSupport("FOR")).to.equal(1);
  });

  it("accepts raw numbers in range", () => {
    expect(resolveVoteSupport(Num.fromBigInt(2n))).to.equal(2);
  });

  it("rejects anything else", () => {
    expect(() => resolveVoteSupport("maybe")).to.throw;
    expect(() => resolveVoteSupport(Num.fromBigInt(3n))).to.throw;
  });
});
