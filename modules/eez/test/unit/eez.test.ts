import { describe, expect, it } from "bun:test";
import { type Action, registerChains } from "@evmcrispr/sdk";
import { decodeFunctionData, encodeErrorResult, parseAbi } from "viem";
import { eezBaseAbi } from "../../src/abis";
import { chains } from "../../src/chains";
import { EEZ_CHAINS } from "../../src/constants";
import {
  assertCrossChainCalls,
  assertForeignRollup,
  CROSS_CHAIN_FALLBACK_GAS,
  createProxyAction,
  estimateCallGas,
  peerRollup,
  remoteLabel,
  resolveRollup,
  rollupIdFor,
} from "../../src/utils/eez";

const l1 = {
  chainId: 7331,
  registry: EEZ_CHAINS[7331].registry,
  rollupId: 0n,
  peerRollupId: 1n,
  peerChainId: 6290,
};

// Unit tests run without the module registry: declare the chains by hand.
registerChains(...chains);

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

  it("names rollups by chain key, chain id or bare rollup id", () => {
    expect(rollupIdFor("eezL2")).toBe(1n);
    expect(rollupIdFor("eezL1")).toBe(0n);
    expect(rollupIdFor(6290)).toBe(1n);
    expect(rollupIdFor(7)).toBe(7n);
    expect(() => rollupIdFor("nowhere")).toThrow(/unknown rollup/);
    expect(() => resolveRollup(l1, "eezL1")).toThrow(/itself/);
    expect(resolveRollup(l1, "eezL2")).toBe(1n);
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

  describe("assertCrossChainCalls", () => {
    const call = {
      to: "0x000000000000000000000000000000000000dEaD",
      data: "0x",
    } as const;

    it("accepts plain contract calls", () => {
      expect(() => assertCrossChainCalls([call, call], "eez:on")).not.toThrow();
      expect(assertCrossChainCalls([call], "eez:on")).toEqual([call]);
    });

    it("rejects a switch inside the block", () => {
      const action: Action = {
        type: "wallet",
        method: "wallet_switchEthereumChain",
        params: [],
      };
      expect(() => assertCrossChainCalls([call, action], "eez:on")).toThrow(
        /switch .*inside eez:on/,
      );
    });

    it("keeps a batch of calls as a batch", () => {
      const action: Action = {
        type: "batched",
        chainId: 1,
        from: call.to,
        actions: [call, call],
      };
      expect(assertCrossChainCalls([call, action, call], "eez:on")).toEqual([
        call,
        action,
        call,
      ]);
    });

    it("rejects a deployment inside a batch in the block", () => {
      const action: Action = {
        type: "batched",
        chainId: 1,
        from: call.to,
        actions: [call, { data: "0x00" }],
      };
      expect(() => assertCrossChainCalls([action], "eez:on")).toThrow(/deploy/);
    });

    it("rejects a deployment inside the block", () => {
      expect(() => assertCrossChainCalls([{ data: "0x00" }], "eez:on")).toThrow(
        /deploy/,
      );
    });

    it("rejects other non-transaction actions", () => {
      const action: Action = { type: "rpc", method: "evm_mine", params: [] };
      expect(() => assertCrossChainCalls([action], "eez:on")).toThrow(
        /non-transaction .*eez:on/,
      );
    });
  });

  describe("estimateCallGas", () => {
    const target = "0x0000000000000000000000000000000000000bEEF";
    const proxy = "0x000000000000000000000000000000000000CAFE";
    /** A module already on the far chain, whose client answers `estimateGas`. */
    const moduleWith = (
      estimateGas: (args: { account: string }) => Promise<bigint>,
    ) =>
      ({
        getChainId: async () => l1.peerChainId,
        getClient: () => ({ estimateGas }),
      }) as never;
    /** What viem raises when the far RPC executes the call and it reverts. */
    const reverted = (data: `0x${string}`) =>
      Object.assign(new Error("execution reverted"), {
        name: "ExecutionRevertedError",
        data,
      });
    const constraintFailed = encodeErrorResult({
      abi: parseAbi([
        "error ConstraintFailed(string assertion, uint256 entryIndex, uint256 paramIndex, uint256 constraintIndex, uint8 constraintType, bytes32 actual, bytes referenceData)",
      ]),
      errorName: "ConstraintFailed",
      args: ["only Bob", 0n, 0n, 0n, 0, `0x${"00".repeat(32)}`, "0x"],
    });

    it("prices the simulated leg with headroom and the protocol overhead", async () => {
      let from: string | undefined;
      const module = moduleWith(async (args) => {
        from = args.account;
        return 100_000n;
      });
      const gas = await estimateCallGas(module, l1, 1n, target, "0x", proxy, {
        failOnRevert: true,
      });
      expect(gas).toBe(400_000n);
      // The far side sees the caller's proxy, so that is who simulates.
      expect(from).toBe(proxy);
    });

    it("fails before sending when the far leg would revert, naming the assertion", async () => {
      const module = moduleWith(async () => {
        throw reverted(constraintFailed);
      });
      await expect(
        estimateCallGas(module, l1, 1n, target, "0x", proxy, {
          failOnRevert: true,
        }),
      ).rejects.toThrow(/would revert on EEZ L2: assertion failed: only Bob/);
    });

    it("describes a plain revert reason", async () => {
      const module = moduleWith(async () => {
        throw reverted(
          encodeErrorResult({
            abi: parseAbi(["error Error(string)"]),
            errorName: "Error",
            args: ["not admitted"],
          }),
        );
      });
      await expect(
        estimateCallGas(module, l1, 1n, target, "0x", proxy, {
          failOnRevert: true,
        }),
      ).rejects.toThrow(/would revert on EEZ L2: not admitted/);
    });

    it.each([
      ["ExecutionNotFound()", "0xed6bc750"],
      [
        "L1 ExecutionNotInCurrentBlock(uint64)",
        `0x9a499f3b${"00".repeat(31)}01`,
      ],
      ["L2 ExecutionNotInCurrentBlock()", "0xf9d330ad"],
    ])(
      "falls back when the far leg itself crosses chains (%s)",
      async (_name, data) => {
        const module = moduleWith(async () => {
          throw reverted(data as `0x${string}`);
        });
        expect(
          await estimateCallGas(module, l1, 1n, target, "0x", proxy, {
            failOnRevert: true,
          }),
        ).toBe(CROSS_CHAIN_FALLBACK_GAS);
      },
    );

    it("falls back when the far RPC cannot be reached", async () => {
      const module = moduleWith(async () => {
        throw new Error("fetch failed");
      });
      expect(
        await estimateCallGas(module, l1, 1n, target, "0x", proxy, {
          failOnRevert: true,
        }),
      ).toBe(CROSS_CHAIN_FALLBACK_GAS);
    });

    it("keeps a revert as a gas fallback when the block is collected for later", async () => {
      const module = moduleWith(async () => {
        throw reverted(constraintFailed);
      });
      expect(
        await estimateCallGas(module, l1, 1n, target, "0x", proxy, {
          failOnRevert: false,
        }),
      ).toBe(CROSS_CHAIN_FALLBACK_GAS);
    });
  });
});
