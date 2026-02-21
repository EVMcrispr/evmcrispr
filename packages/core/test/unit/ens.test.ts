import { describe, it } from "bun:test";
import { ErrorException, normalizeEnsName } from "@evmcrispr/sdk";
import { expect } from "chai";

describe("SDK > utils > normalizeEnsName", () => {
  it("should normalize a simple .eth name", () => {
    const result = normalizeEnsName("vitalik.eth");
    expect(result).to.equal("vitalik.eth");
  });

  it("should normalize names with uppercase", () => {
    const result = normalizeEnsName("Vitalik.ETH");
    expect(result).to.equal("vitalik.eth");
  });

  it("should normalize subdomain names", () => {
    const result = normalizeEnsName("sub.domain.eth");
    expect(result).to.equal("sub.domain.eth");
  });

  it("should throw ErrorException for invalid ENS names", () => {
    try {
      normalizeEnsName("[invalid]");
      throw new Error("expected to throw");
    } catch (err: any) {
      expect(err).to.be.instanceOf(ErrorException);
      expect(err.message).to.include("Invalid ENS name");
    }
  });
});
