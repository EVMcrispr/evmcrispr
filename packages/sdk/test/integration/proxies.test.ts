import { afterAll, beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient, resetAnvil } from "@evmcrispr/test-utils";
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
    const EXPECTED_IMPL: Address = "0xCE579ae642E40F8356a9f538c6dB4E2Ea91C5850";

    it("should resolve to the implementation address", async () => {
      const impl = await fetchImplementationAddress(AAVE_AGNO_USDC, client);
      expect(impl).to.not.be.undefined;
      expect(getAddress(impl!)).to.equal(getAddress(EXPECTED_IMPL));
    });
  });

  describe("beacon proxy", () => {
    const BEACON_PROXY: Address = "0x2af76117f86D6E346e256173B44966e802f3cCbf";

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

  describe("Safe proxy (masterCopy)", () => {
    const SAFE_PROXY: Address = "0x849D52316331967b6fF1198e5E32A0eB168D039d";
    const EXPECTED_IMPL: Address = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";

    it("should resolve to the singleton implementation", async () => {
      const impl = await fetchImplementationAddress(SAFE_PROXY, client);
      expect(impl).to.not.be.undefined;
      expect(getAddress(impl!)).to.equal(getAddress(EXPECTED_IMPL));
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
      "0x589750BA8aF186cE5B55391B0b7148cAD43a1619";

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

describe("SDK > utils > fetchImplementationAddress (mainnet)", () => {
  let mainnetClient: PublicClient;

  beforeAll(async () => {
    mainnetClient = await resetAnvil(1);
  });

  afterAll(async () => {
    await resetAnvil();
  });

  describe("ZeppelinOS proxy (USDC FiatTokenProxy)", () => {
    const USDC_PROXY: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    it("should resolve to a non-zero implementation address", async () => {
      const impl = await fetchImplementationAddress(USDC_PROXY, mainnetClient);
      expect(impl).to.not.be.undefined;
      expect(isAddress(impl!)).to.be.true;
    });
  });
});
