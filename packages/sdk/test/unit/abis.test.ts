import { afterEach, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import type { Address, PublicClient } from "viem";
import { getAddress, pad } from "viem";
import { fetchAbi } from "../../src/utils/abis";

const PROXY = getAddress("0xc6b7aca6de8a6044e0e32d0c841a89244a10d284");
const IMPL = getAddress("0xce579ae642e40f8356a9f538c6db4e2ea91c5850");

const PROXY_ABI = [
  {
    type: "function",
    name: "upgradeTo",
    inputs: [{ name: "newImplementation", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
];
const IMPL_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

/**
 * Minimal proxy-shaped client: every EIP-1967-style slot read on the proxy
 * points at IMPL, everything else is empty. That is enough for
 * `fetchImplementationAddress` to resolve PROXY -> IMPL.
 */
const proxyClient = (): PublicClient =>
  ({
    getChainId: async () => 100,
    getCode: async () => "0x60806040",
    getStorageAt: async ({ address }: { address: Address }) =>
      getAddress(address) === PROXY
        ? pad(IMPL.toLowerCase() as Address)
        : pad("0x0"),
    multicall: async () => [{ status: "failure" }, { status: "failure" }],
  }) as unknown as PublicClient;

const realFetch = globalThis.fetch;

/** Stub the ABI service: `abis` maps an address to its response body. */
function stubAbiService(abis: Partial<Record<Address, unknown>>): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const address = getAddress(url.split("/").pop()!) as Address;
    const body = abis[address];
    if (body === undefined) {
      return Response.json({ error: "abi not found" }, { status: 404 });
    }
    return Response.json(body);
  }) as typeof fetch;
}

async function rejection(
  promise: Promise<unknown>,
): Promise<Error | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as Error;
  }
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("SDK > utils > fetchAbi", () => {
  it("merges the implementation ABI with the proxy's own", async () => {
    stubAbiService({ [PROXY]: PROXY_ABI, [IMPL]: IMPL_ABI });

    const [address, abi] = await fetchAbi(PROXY, proxyClient());

    expect(getAddress(address)).to.equal(IMPL);
    expect(abi.map((entry: any) => entry.name)).to.deep.equal([
      "mint",
      "upgradeTo",
    ]);
  });

  it("keeps the implementation ABI when the proxy's own is unverified", async () => {
    stubAbiService({ [IMPL]: IMPL_ABI });

    const [, abi] = await fetchAbi(PROXY, proxyClient());

    expect(abi.map((entry: any) => entry.name)).to.deep.equal(["mint"]);
  });

  it("keeps the proxy ABI when the implementation's own is unverified", async () => {
    stubAbiService({ [PROXY]: PROXY_ABI });

    const [, abi] = await fetchAbi(PROXY, proxyClient());

    expect(abi.map((entry: any) => entry.name)).to.deep.equal(["upgradeTo"]);
  });

  it("surfaces the failure instead of an empty ABI when neither lookup answers", async () => {
    stubAbiService({});

    const error = await rejection(fetchAbi(PROXY, proxyClient()));

    expect(error?.message).to.match(/Failed to fetch ABI/);
  });
});
