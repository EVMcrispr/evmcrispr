import { afterAll, beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient, resetAnvil } from "@evmcrispr/test-utils";
import type { Address, PublicClient } from "viem";
import { getAddress, isAddress, keccak256, toHex } from "viem";
import { fetchImplementationAddress } from "../../src/utils/proxies";

describe("SDK > utils > fetchImplementationAddress", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  describe("EIP-1967 transparent proxy", () => {
    const AAVE_AGNO_USDC: Address =
      "0xc6B7AcA6DE8a6044E0e32d0c841a89244A10D284";

    it("should resolve to the implementation address", async () => {
      const impl = await fetchImplementationAddress(AAVE_AGNO_USDC, client);
      expect(impl).to.not.be.undefined;
      expect(isAddress(impl!)).to.be.true;
      expect(getAddress(impl!)).to.not.equal(getAddress(AAVE_AGNO_USDC));
      // Resolved implementation should itself not resolve further.
      const nested = await fetchImplementationAddress(impl!, client);
      expect(nested).to.be.undefined;
    });
  });

  describe("beacon proxy", () => {
    /**
     * Uses a deterministic mocked client so this doesn't rely on mutable
     * on-chain addresses.
     */
    it("should resolve implementation via beacon", async () => {
      const proxy = "0x1111111111111111111111111111111111111111" as Address;
      const beacon = "0x2222222222222222222222222222222222222222" as Address;
      const implementation =
        "0x3333333333333333333333333333333333333333" as Address;

      const EIP1967_BEACON_SLOT = toHex(
        BigInt(keccak256(toHex("eip1967.proxy.beacon"))) - 1n,
      );

      const beaconRaw =
        `0x${"0".repeat(24)}${beacon.slice(2)}` as `0x${string}`;

      const mockClient = {
        getCode: async () => "0x6000",
        getStorageAt: async ({
          address,
          slot,
        }: {
          address: Address;
          slot: `0x${string}`;
        }) => {
          if (
            address.toLowerCase() === proxy.toLowerCase() &&
            slot.toLowerCase() === EIP1967_BEACON_SLOT.toLowerCase()
          ) {
            return beaconRaw;
          }
          return "0x";
        },
        multicall: async ({
          contracts,
        }: {
          contracts: Array<{ address: Address; functionName: string }>;
        }) => {
          const firstAddress = contracts[0]?.address?.toLowerCase();
          if (firstAddress === beacon.toLowerCase()) {
            return [
              { status: "success" as const, result: implementation },
              { status: "failure" as const, error: {} },
            ];
          }
          return [
            { status: "failure" as const, error: {} },
            { status: "failure" as const, error: {} },
          ];
        },
      } as unknown as PublicClient;

      const impl = await fetchImplementationAddress(proxy, mockClient);
      expect(impl).to.not.be.undefined;
      expect(getAddress(impl!)).to.equal(getAddress(implementation));
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
