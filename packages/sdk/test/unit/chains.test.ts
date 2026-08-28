import { describe, expect, it } from "bun:test";
import { http } from "viem";
import { gnosis } from "viem/chains";
import {
  defaultTransport,
  registerChains,
  registeredChain,
  resolveChain,
  toViemChain,
  transportUrl,
  viemChainById,
} from "../../src/utils/chains";

const devnet = {
  id: 987654,
  name: "Unit Devnet",
  rpcUrl: "http://127.0.0.1:9",
  testnet: true,
};

describe("chains registry", () => {
  it("falls back to viem's list for known ids", () => {
    expect(viemChainById(gnosis.id)?.name).toBe(gnosis.name);
    expect(viemChainById(undefined)).toBeUndefined();
  });

  it("is undefined for an unknown id with no transport", () => {
    expect(resolveChain(424242)).toBeUndefined();
    expect(defaultTransport(424242)).toBeUndefined();
  });

  it("synthesizes a chain for an unknown id when a transport exists", () => {
    const chain = resolveChain(424242, http("http://127.0.0.1:1"));
    expect(chain?.id).toBe(424242);
    expect(chain?.rpcUrls.default.http).toEqual(["http://127.0.0.1:1"]);
  });

  it("exposes registered declarations everywhere a chain is looked up", () => {
    registerChains(devnet);
    expect(registeredChain(devnet.id)).toEqual(devnet);
    expect(viemChainById(devnet.id)?.name).toBe("Unit Devnet");
    expect(resolveChain(devnet.id)?.testnet).toBe(true);
    expect(transportUrl(defaultTransport(devnet.id))).toBe(devnet.rpcUrl);
  });

  it("lets a later registration replace an earlier one", () => {
    registerChains({ ...devnet, name: "Renamed" });
    expect(viemChainById(devnet.id)?.name).toBe("Renamed");
  });

  it("builds a viem chain with explorer and currency defaults", () => {
    const chain = toViemChain({
      ...devnet,
      explorerUrl: "http://explorer.local",
    });
    expect(chain.nativeCurrency.symbol).toBe("ETH");
    expect(chain.blockExplorers?.default.url).toBe("http://explorer.local");
  });

  it("reads no URL from non-http transports", () => {
    expect(transportUrl(undefined)).toBeUndefined();
    expect(transportUrl(http())).toBeUndefined();
  });
});
