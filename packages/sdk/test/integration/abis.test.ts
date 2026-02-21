import { beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import type { Abi, AbiFunction } from "abitype";
import type { Address, PublicClient } from "viem";
import { fetchAbi } from "../../src/utils/abis";

const hasFunctionNamed = (abi: Abi, name: string): boolean =>
  abi.some(
    (entry): entry is AbiFunction =>
      entry.type === "function" && entry.name === name,
  );

describe("SDK > utils > fetchAbi", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  describe("EIP-1967 transparent proxy (Aave aGNO USDC)", () => {
    const PROXY: Address = "0xc6B7AcA6DE8a6044E0e32d0c841a89244A10D284";

    it("should include both proxy and implementation functions", async () => {
      const [, abi] = await fetchAbi(PROXY, client);
      expect(abi.length).to.be.greaterThan(0);
      // Implementation functions (aToken)
      expect(hasFunctionNamed(abi, "mint")).to.be.true;
      expect(hasFunctionNamed(abi, "burn")).to.be.true;
      // Proxy admin functions
      expect(hasFunctionNamed(abi, "admin")).to.be.true;
      expect(hasFunctionNamed(abi, "upgradeTo")).to.be.true;
    });
  });

  describe("Aragon AppProxy (Agent)", () => {
    const ARAGON_AGENT: Address = "0x01d9c9ca040e90feb47c7513d9a3574f6e1317bd";

    it("should return implementation functions for an AppProxy", async () => {
      const [, abi] = await fetchAbi(ARAGON_AGENT, client);
      expect(abi.length).to.be.greaterThan(0);
      expect(hasFunctionNamed(abi, "execute")).to.be.true;
    });
  });

  describe("non-proxy contract", () => {
    const NON_PROXY: Address = "0xCE579ae642e40f8356a9f538c6db4e2ea91C5850";

    it("should return the contract's own ABI", async () => {
      const [addr, abi] = await fetchAbi(NON_PROXY, client);
      expect(addr).to.equal(NON_PROXY);
      expect(abi.length).to.be.greaterThan(0);
    });
  });
});
