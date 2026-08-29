import { describe, expect, it } from "bun:test";
import {
  chainArgType,
  chainIdForName,
  chainNameForId,
  chainNames,
  resolveChainId,
} from "../../src/utils/chainArgType";
import { registerChains } from "../../src/utils/chains";

describe("chain names", () => {
  it("knows viem's export names", () => {
    expect(chainIdForName("gnosis")).toBe(100);
    expect(chainNameForId(1)).toBe("mainnet");
    expect(resolveChainId("baseSepolia")).toBe(84532);
  });

  it("adds module-declared keys, ahead of viem's names", () => {
    registerChains({
      id: 7654321,
      key: "unitL1",
      name: "Unit L1",
      rpcUrl: "http://127.0.0.1:3",
    });
    expect(chainIdForName("unitL1")).toBe(7654321);
    expect(chainNameForId(7654321)).toBe("unitL1");
    expect(resolveChainId("unitL1")).toBe(7654321);
    expect(() => chainArgType.validate?.("chain", "unitL1")).not.toThrow();
    // Declared keys come before every viem name (other suites in this
    // process may have declared chains too, so not necessarily first).
    const names = chainNames();
    expect(names.indexOf("unitL1")).toBeLessThan(names.indexOf("gnosis"));
  });

  it("still rejects unknown names", () => {
    expect(() => resolveChainId("nowhere")).toThrow(/unknown chain/);
  });
});
