import { describe, expect, it } from "bun:test";
import { http } from "viem";
import { gnosis } from "viem/chains";
import {
  defaultTransport,
  registerChains,
  registeredChain,
  registeredChains,
  resolveChain,
  setChainUrlPolicy,
  toViemChain,
  transportUrl,
  viemChainById,
} from "../../src/utils/chains";

const devnet = {
  key: "unitDevnet",
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

  it("hands wallets the host's transport URL for a registered chain", () => {
    const chain = resolveChain(devnet.id, http("https://proxy.example/rpc"));
    expect(chain?.name).toBe("Unit Devnet");
    expect(chain?.rpcUrls.default.http).toEqual(["https://proxy.example/rpc"]);
    expect(resolveChain(devnet.id)?.rpcUrls.default.http).toEqual([
      devnet.rpcUrl,
    ]);
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

  it("defaults the explorer API to <explorerUrl>/api at registration", () => {
    registerChains({ ...devnet, explorerUrl: "http://explorer.local/" });
    expect(registeredChain(devnet.id)?.explorerApiUrl).toBe(
      "http://explorer.local/api",
    );
    registerChains({
      ...devnet,
      explorerUrl: "http://explorer.local",
      explorerApiUrl: "http://backend.local:4001/api",
    });
    expect(registeredChain(devnet.id)?.explorerApiUrl).toBe(
      "http://backend.local:4001/api",
    );
  });

  it("applies the host's URL policy to RPC and explorer API URLs", () => {
    registerChains({
      ...devnet,
      explorerUrl: "http://explorer.local",
      explorerApiUrl: "http://backend.local:4001/api",
    });
    setChainUrlPolicy((url) =>
      url.startsWith("http://") ? `https://proxy.example/${url}` : url,
    );
    try {
      const def = registeredChain(devnet.id);
      expect(def?.rpcUrl).toBe(`https://proxy.example/${devnet.rpcUrl}`);
      expect(def?.explorerApiUrl).toBe(
        "https://proxy.example/http://backend.local:4001/api",
      );
      // Links are for people, not fetch — they stay as declared.
      expect(def?.explorerUrl).toBe("http://explorer.local");
      expect(registeredChains().find((c) => c.id === devnet.id)?.rpcUrl).toBe(
        `https://proxy.example/${devnet.rpcUrl}`,
      );
      expect(transportUrl(defaultTransport(devnet.id))).toBe(
        `https://proxy.example/${devnet.rpcUrl}`,
      );
      expect(resolveChain(devnet.id)?.rpcUrls.default.http).toEqual([
        `https://proxy.example/${devnet.rpcUrl}`,
      ]);
    } finally {
      setChainUrlPolicy(undefined);
    }
    expect(registeredChain(devnet.id)?.rpcUrl).toBe(devnet.rpcUrl);
  });

  it("reads no URL from non-http transports", () => {
    expect(transportUrl(undefined)).toBeUndefined();
    expect(transportUrl(http())).toBeUndefined();
  });
});
