import { describe, it } from "bun:test";
import { computeNextContractAddress } from "@evmcrispr/sdk";
import { expect } from "chai";
import { getContractAddress, isAddress } from "viem";

const DEPLOYER = "0x1234567890abcdef1234567890abcdef12345678";

describe("SDK > utils > computeNextContractAddress", () => {
  it("should compute the correct CREATE address for offset 0", async () => {
    const mockGetTxCount = async () => 5;
    const result = await computeNextContractAddress(
      DEPLOYER,
      0,
      mockGetTxCount,
    );
    const expected = getContractAddress({ from: DEPLOYER, nonce: 5n });
    expect(result).to.equal(expected);
  });

  it("should apply the offset correctly", async () => {
    const mockGetTxCount = async () => 3;
    const result = await computeNextContractAddress(
      DEPLOYER,
      2,
      mockGetTxCount,
    );
    const expected = getContractAddress({ from: DEPLOYER, nonce: 5n });
    expect(result).to.equal(expected);
  });

  it("should return a valid address", async () => {
    const mockGetTxCount = async () => 0;
    const result = await computeNextContractAddress(
      DEPLOYER,
      0,
      mockGetTxCount,
    );
    expect(isAddress(result)).to.be.true;
  });

  it("should handle nonce 0", async () => {
    const mockGetTxCount = async () => 0;
    const result = await computeNextContractAddress(
      DEPLOYER,
      0,
      mockGetTxCount,
    );
    const expected = getContractAddress({ from: DEPLOYER, nonce: 0n });
    expect(result).to.equal(expected);
  });
});
