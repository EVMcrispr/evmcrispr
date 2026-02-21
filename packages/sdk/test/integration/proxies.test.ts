import { beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import type { Address, PublicClient } from "viem";
import { getAddress, isAddress } from "viem";
import { fetchImplementationAddress } from "../../src/utils/proxies";

describe("SDK > utils > fetchImplementationAddress", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  describe("EIP-1967 transparent proxy", () => {
    const AAVE_AGNO_USDC: Address =
      "0xc6B7AcA6DE8a6044E0e32d0c841a89244A10D284";
    const EXPECTED_IMPL: Address = "0xCE579ae642e40f8356a9f538c6db4e2ea91C5850";

    it("should resolve to the implementation address", async () => {
      const impl = await fetchImplementationAddress(AAVE_AGNO_USDC, client);
      expect(impl).to.not.be.undefined;
      expect(getAddress(impl!)).to.equal(getAddress(EXPECTED_IMPL));
    });
  });

  describe("beacon proxy", () => {
    const BEACON_PROXY: Address = "0x4c524050755385317FaD22De37494f1e9F08be99";

    it("should resolve implementation via beacon", async () => {
      const impl = await fetchImplementationAddress(BEACON_PROXY, client);
      expect(impl).to.not.be.undefined;
      expect(isAddress(impl!)).to.be.true;
    });
  });

  describe("EIP-1167 minimal proxy (clone)", () => {
    const CLONE: Address = "0x1E22Dc7a08Ca095Bd6F42C5ba86c4e656687C26B";
    const EXPECTED_IMPL: Address = "0xcff8bd1053b052104a764f9e8390f5629b041d4e";

    it("should resolve via bytecode pattern", async () => {
      const impl = await fetchImplementationAddress(CLONE, client);
      expect(impl).to.not.be.undefined;
      expect(getAddress(impl!)).to.equal(getAddress(EXPECTED_IMPL));
    });
  });

  describe("Safe proxy", () => {
    const SAFE_PROXY: Address = "0x1Ed7A3D9A3702e6a22d4d90286B98Df42d0310e0";

    it("should resolve to the singleton implementation", async () => {
      const impl = await fetchImplementationAddress(SAFE_PROXY, client);
      expect(impl).to.not.be.undefined;
      expect(isAddress(impl!)).to.be.true;
    });
  });

  describe("Aragon AppProxy (implementation() call)", () => {
    const ARAGON_AGENT: Address = "0x01d9c9ca040e90feb47c7513d9a3574f6e1317bd";

    it("should resolve via implementation() function call", async () => {
      const impl = await fetchImplementationAddress(ARAGON_AGENT, client);
      expect(impl).to.not.be.undefined;
      expect(isAddress(impl!)).to.be.true;
    });
  });

  describe("non-proxy contract", () => {
    const IMPLEMENTATION_CONTRACT: Address =
      "0xCE579ae642e40f8356a9f538c6db4e2ea91C5850";

    it("should return undefined for a non-proxy implementation contract", async () => {
      const impl = await fetchImplementationAddress(
        IMPLEMENTATION_CONTRACT,
        client,
      );
      expect(impl).to.be.undefined;
    });
  });

  describe("edge cases", () => {
    it("should return undefined for an EOA", async () => {
      const EOA: Address = "0xc125218F4Df091eE40624784caF7F47B9738086f";
      const impl = await fetchImplementationAddress(EOA, client);
      expect(impl).to.be.undefined;
    });
  });
});
