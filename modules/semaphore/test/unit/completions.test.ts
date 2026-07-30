import { describe, it } from "bun:test";
import { expect, helperLabels } from "@evmcrispr/test-utils";
import { helpers } from "../../src/_generated";

describe("semaphore > completions", () => {
  const semaphore = helperLabels(helpers, { module: "semaphore" });

  it("exposes every helper", () => {
    expect(semaphore.all).to.include.members([
      "@semaphore:root",
      "@semaphore:size",
      "@semaphore:depth",
      "@semaphore:members",
      "@semaphore:nullifier",
      "@semaphore:verify",
    ]);
  });

  it("buckets helpers by return type", () => {
    expect(semaphore.number).to.include.members([
      "@semaphore:root",
      "@semaphore:nullifier",
    ]);
    expect(semaphore.bool).to.include.members(["@semaphore:verify"]);
  });
});
