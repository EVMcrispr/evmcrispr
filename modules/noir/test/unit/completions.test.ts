import { describe, it } from "bun:test";
import { expect, helperLabels } from "@evmcrispr/test-utils";
import { helpers } from "../../src/_generated";

describe("noir > completions", () => {
  const noir = helperLabels(helpers, { module: "noir" });

  it("exposes every helper", () => {
    expect(noir.all).to.include.members([
      "@noir:compile",
      "@noir:vkey",
      "@noir:verifier",
      "@noir:verify",
      "@noir:proof",
    ]);
  });

  it("buckets helpers by return type", () => {
    expect(noir.bool).to.include.members(["@noir:verify"]);
    expect(noir.bool).to.not.include.members(["@noir:compile", "@noir:proof"]);
  });
});
