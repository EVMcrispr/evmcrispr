import { describe, it } from "bun:test";
import { expect, helperLabels } from "@evmcrispr/test-utils";
import { helpers } from "../../src/_generated";

describe("zk > completions", () => {
  const zk = helperLabels(helpers, { module: "zk" });

  it("exposes every helper", () => {
    expect(zk.all).to.include.members([
      "@zk:poseidon",
      "@zk:field",
      "@zk:field.hash",
      "@zk:tree.root",
      "@zk:tree.proof",
      "@zk:tree.verify",
      "@zk:proof",
    ]);
  });

  it("buckets helpers by return type", () => {
    expect(zk.number).to.include.members([
      "@zk:poseidon",
      "@zk:field",
      "@zk:field.hash",
      "@zk:tree.root",
    ]);
    expect(zk.bool).to.include.members(["@zk:tree.verify"]);
    expect(zk.number).to.not.include.members(["@zk:tree.proof", "@zk:proof"]);
  });
});
