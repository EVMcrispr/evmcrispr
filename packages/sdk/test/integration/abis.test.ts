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

// These hit the live ABI service plus on-chain proxy-slot reads; a
// transient miss on either side is retried rather than failing the run.
const LIVE = { retry: 2 };

const ABI_SERVICE = "https://api.evmcrispr.com/abi/100";
// Verified on Gnosis since 2021 — if the service cannot answer for this one,
// it is the service that is down, not the contract that changed.
const KNOWN_VERIFIED = "0xCE579ae642E40F8356a9f538c6dB4E2Ea91C5850";

/**
 * The ABI service proxies Etherscan and Blockscout, both of which rate-limit
 * and now and then stall for a minute or two — long enough to burn all of a
 * test's retries (that is how run 31657953825 went red). A red build here
 * should mean proxy resolution or ABI merging broke, so probe the service
 * once up front and skip the suite when it is the one that is unavailable.
 */
const abiServiceReachable = async (): Promise<boolean> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const res = await fetch(`${ABI_SERVICE}/${KNOWN_VERIFIED}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return true;
    } catch {
      // Network-level failure: retried like a non-OK response.
    }
  }
  console.warn(
    `Skipping fetchAbi integration tests: ${ABI_SERVICE} is unreachable`,
  );
  return false;
};

const SERVICE_UP = await abiServiceReachable();

describe.skipIf(!SERVICE_UP)("SDK > utils > fetchAbi", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  describe("EIP-1967 transparent proxy (Aave aGNO USDC)", () => {
    const PROXY: Address = "0xc6B7AcA6DE8a6044E0e32d0c841a89244A10D284";

    it(
      "should include both proxy and implementation functions",
      async () => {
        const [, abi] = await fetchAbi(PROXY, client);
        expect(abi.length).to.be.greaterThan(0);
        // Implementation functions (aToken)
        expect(hasFunctionNamed(abi, "mint")).to.be.true;
        expect(hasFunctionNamed(abi, "burn")).to.be.true;
        // Proxy admin functions
        expect(hasFunctionNamed(abi, "admin")).to.be.true;
        expect(hasFunctionNamed(abi, "upgradeTo")).to.be.true;
      },
      LIVE,
    );
  });

  describe("Aragon AppProxy (Agent)", () => {
    const ARAGON_AGENT: Address = "0x01d9c9ca040e90feb47c7513d9a3574f6e1317bd";

    it(
      "should return implementation functions for an AppProxy",
      async () => {
        const [, abi] = await fetchAbi(ARAGON_AGENT, client);
        expect(abi.length).to.be.greaterThan(0);
        expect(hasFunctionNamed(abi, "execute")).to.be.true;
      },
      LIVE,
    );
  });

  describe("non-proxy contract", () => {
    const NON_PROXY: Address = "0xCE579ae642E40F8356a9f538c6dB4E2Ea91C5850";

    it(
      "should return the contract's own ABI",
      async () => {
        const [addr, abi] = await fetchAbi(NON_PROXY, client);
        expect(addr).to.equal(NON_PROXY);
        expect(abi.length).to.be.greaterThan(0);
      },
      LIVE,
    );
  });
});
