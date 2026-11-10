import { describe, expect, it } from "bun:test";
import { registerChains } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { callsCrossChainProxy } from "../../src/utils/crossChain";
import { buildSafeTx } from "../../src/utils/safeTx";
import { transactionSignable } from "../../src/utils/signables";

const CHAIN = 100;
const REGISTRY = "0x00000000000000000000000000000000000ee2e0" as Address;
const SAFE = "0x5afe000000000000000000000000000000005afe" as Address;
const PROXY = "0x9000000000000000000000000000000000000009" as Address;
const OTHER = "0x0000000000000000000000000000000000000abc" as Address;

// A gateway for a chain viem knows, whose registry tells proxies apart.
registerChains({
  id: CHAIN,
  gateway: "https://gateway.example/l1",
  crossChainRegistry: REGISTRY,
});

/** A registry that knows `proxies`. */
const registry = (proxies: Address[]) => ({
  readContract: (async ({ address, args }: any) => {
    if (address !== REGISTRY) throw new Error("not the registry");
    return [proxies.includes(args[0]), OTHER, 0n];
  }) as any,
});

describe("safe > a queued transaction that crosses chains", () => {
  it("is one that calls a proxy, directly or inside its MultiSend", async () => {
    const direct = transactionSignable(
      CHAIN,
      SAFE,
      buildSafeTx([{ to: PROXY, data: "0x1234" }], 0n),
    );
    const batched = transactionSignable(
      CHAIN,
      SAFE,
      buildSafeTx(
        [
          { to: OTHER, data: "0x" },
          { to: PROXY, data: "0x1234" },
        ],
        0n,
      ),
    );
    // Two calls go through MultiSend (a delegate call).
    expect(batched.kind === "transaction" && batched.tx.operation).toBe(1);
    for (const signable of [direct, batched])
      expect(
        await callsCrossChainProxy(CHAIN, signable, registry([PROXY])),
      ).toBe(true);
  });

  it("is not one whose calls the registry does not know, or on a chain without one", async () => {
    const signable = transactionSignable(
      CHAIN,
      SAFE,
      buildSafeTx([{ to: OTHER, data: "0x1234" }], 0n),
    );
    expect(await callsCrossChainProxy(CHAIN, signable, registry([PROXY]))).toBe(
      false,
    );
    const elsewhere = transactionSignable(
      5,
      SAFE,
      buildSafeTx([{ to: PROXY, data: "0x1234" }], 0n),
    );
    expect(await callsCrossChainProxy(5, elsewhere, registry([PROXY]))).toBe(
      false,
    );
  });
});
