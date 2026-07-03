import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { size } from "viem";
import { cloneInitCode } from "../../src/utils";

const TARGET = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb" as const;

describe("Proxies > unit > cloneInitCode", () => {
  it("assembles the ERC-1167 creation bytecode", () => {
    const initCode = cloneInitCode(TARGET);
    expect(size(initCode)).to.equal(55);
    expect(initCode.startsWith("0x3d602d80600a3d3981f3363d3d373d3d3d363d73")).to
      .be.true;
    expect(initCode).to.include(TARGET.slice(2).toLowerCase());
    expect(initCode.endsWith("5af43d82803e903d91602b57fd5bf3")).to.be.true;
  });
});
