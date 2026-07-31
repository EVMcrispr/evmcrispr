import { describe, it } from "bun:test";
import { expect, helperLabels } from "@evmcrispr/test-utils";
import { helpers } from "../../src/_generated";

describe("circom > completions", () => {
  const circom = helperLabels(helpers, { module: "circom" });

  it("exposes every helper", () => {
    expect(circom.all).to.include.members([
      "@circom:poseidon",
      "@circom:field",
      "@circom:field.hash",
      "@circom:tree.root",
      "@circom:tree.proof",
      "@circom:tree.verify",
      "@circom:proof",
    ]);
  });

  it("buckets helpers by return type", () => {
    expect(circom.number).to.include.members([
      "@circom:poseidon",
      "@circom:field",
      "@circom:field.hash",
      "@circom:tree.root",
    ]);
    expect(circom.bool).to.include.members(["@circom:tree.verify"]);
    expect(circom.number).to.not.include.members([
      "@circom:tree.proof",
      "@circom:proof",
    ]);
  });
});
