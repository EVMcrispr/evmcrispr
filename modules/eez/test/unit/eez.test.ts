import { describe, expect, it } from "bun:test";
import { decodeFunctionData } from "viem";
import { eezBaseAbi } from "../../src/abis";
import { chains } from "../../src/chains";
import { EEZ_CHAINS } from "../../src/constants";
import {
  assertForeignRollup,
  createProxyAction,
  peerRollup,
  remoteLabel,
  resolveRollup,
} from "../../src/utils/eez";

const l1 = {
  chainId: 7331,
  registry: EEZ_CHAINS[7331].registry,
  rollupId: 0n,
  peerRollupId: 1n,
  peerChainId: 6290,
  front: EEZ_CHAINS[7331].front,
};

describe("eez utils", () => {
  it("pairs L1 with the rollup and back", () => {
    expect(peerRollup(0n)).toBe(1n);
    expect(peerRollup(1n)).toBe(0n);
  });

  it("refuses a proxy for the current rollup itself", () => {
    expect(() => assertForeignRollup(0n, 0n, 7331)).toThrow(
      /rollup 0 is .* itself/,
    );
    expect(() => assertForeignRollup(-1n, 0n, 7331)).toThrow(/negative/);
    expect(() => assertForeignRollup(1n, 0n, 7331)).not.toThrow();
  });

  it("defaults the rollup to the other side", () => {
    expect(resolveRollup(l1)).toBe(1n);
    expect(resolveRollup(l1, 3)).toBe(3n);
    expect(resolveRollup(l1, "2")).toBe(2n);
    expect(() => resolveRollup(l1, 0)).toThrow(/itself/);
  });

  it("encodes createCrossChainProxy against the registry", () => {
    const target = "0x000000000000000000000000000000000000dEaD";
    const action = createProxyAction(l1.registry, target, 1n);
    expect(action.to).toBe(l1.registry);
    expect(action.value).toBe(0n);
    const decoded = decodeFunctionData({
      abi: eezBaseAbi,
      data: action.data!,
    });
    expect(decoded.functionName).toBe("createCrossChainProxy");
    expect(decoded.args).toEqual([target, 1n]);
  });

  it("labels the far side by chain when it is the peer", () => {
    expect(remoteLabel(l1, 1n)).not.toMatch(/^rollup/);
    expect(remoteLabel(l1, 7n)).toBe("rollup 7");
  });

  it("declares a built-in entry for every shipped chain", () => {
    for (const chain of chains) {
      expect(EEZ_CHAINS[chain.id]).toBeDefined();
      expect(EEZ_CHAINS[EEZ_CHAINS[chain.id].peerChainId].peerChainId).toBe(
        chain.id,
      );
    }
  });
});
