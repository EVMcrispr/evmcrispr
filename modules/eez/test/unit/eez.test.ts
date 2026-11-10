import { describe, expect, it } from "bun:test";
import { type Action, registerChains } from "@evmcrispr/sdk";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, encodeErrorResult, parseAbi } from "viem";
import { eezBaseAbi } from "../../src/abis";
import { CROSS_CHAIN_GATES, chains } from "../../src/chains";
import { EEZ_CHAINS } from "../../src/constants";
import {
  assertCrossChainCalls,
  assertForeignRollup,
  CROSS_CHAIN_FALLBACK_GAS,
  createProxyAction,
  eezChainId,
  estimateCallGas,
  peerRollup,
  refuseBareOne,
  remoteLabel,
  resolveRollup,
  rollupIdFor,
  splitFarProxyCreations,
} from "../../src/utils/eez";

const l1 = {
  chainId: 10200,
  registry: EEZ_CHAINS[10200].registry,
  rollupId: 0n,
  peerRollupId: 2n,
  peerChainId: 699169,
};

// Unit tests run without the module registry: declare the chains by hand.
registerChains(...chains);

describe("eez utils", () => {
  it("pairs L1 with the rollup and back", () => {
    expect(peerRollup(0n)).toBe(1n);
    expect(peerRollup(1n)).toBe(0n);
  });

  it("refuses a proxy for the current rollup itself", () => {
    expect(() => assertForeignRollup(0n, 0n, 10200)).toThrow(
      /rollup 0 is .* itself/,
    );
    expect(() => assertForeignRollup(-1n, 0n, 10200)).toThrow(/negative/);
    expect(() => assertForeignRollup(1n, 0n, 10200)).not.toThrow();
  });

  it("names rollups by chain key, chain id or bare rollup id", () => {
    expect(rollupIdFor("eezL2")).toBe(2n);
    expect(rollupIdFor("gnosisChiado")).toBe(0n);
    expect(rollupIdFor(699169)).toBe(2n);
    expect(rollupIdFor(7)).toBe(7n);
    expect(() => rollupIdFor("nowhere")).toThrow(/unknown rollup/);
    expect(() => resolveRollup(l1, "gnosisChiado")).toThrow(/itself/);
    expect(resolveRollup(l1, "eezL2")).toBe(2n);
  });

  it("defaults the rollup to the other side", () => {
    expect(resolveRollup(l1)).toBe(2n);
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

  describe("proxy creations a block asks of the far chain", () => {
    const l2 = {
      chainId: 699169,
      registry: EEZ_CHAINS[699169].registry,
      rollupId: 2n,
      peerRollupId: 0n,
      peerChainId: 10200,
    };
    const target = "0x000000000000000000000000000000000000dEaD";
    const create = {
      ...createProxyAction(l2.registry, target, 0n),
      to: l2.registry,
    } as any;
    const call = { to: target, data: "0x12345678" } as any;

    it("become plain transactions on that chain, wallet switched there and back", () => {
      const { crossing, direct } = splitFarProxyCreations(
        [create, call],
        l2,
        10200,
        false,
      );
      expect(crossing).toEqual([call]);
      expect(direct).toHaveLength(3);
      expect((direct[0] as any).params[0].chainId).toBe("0xaab21");
      expect(direct[1]).toMatchObject({
        to: l2.registry,
        data: create.data,
        chainId: 699169,
      });
      expect((direct[2] as any).params[0].chainId).toBe("0x27d8");
    });

    it("leave a block without creations alone", () => {
      expect(splitFarProxyCreations([call], l2, 10200, false)).toEqual({
        crossing: [call],
        direct: [],
      });
    });

    it("are refused in a collected block, naming the command that makes them", () => {
      expect(() =>
        splitFarProxyCreations([create, call], l2, 10200, true),
      ).toThrow(
        /eez:deploy-proxy 0x000000000000000000000000000000000000dEaD --chain 0/,
      );
    });
  });

  it("labels the far side by chain when it is the peer", () => {
    expect(remoteLabel(l1, 2n)).not.toMatch(/^rollup/);
    expect(remoteLabel(l1, 7n)).toBe("rollup 7");
  });

  it("refuses a bare 1 for an EEZ chain: mainnet and rollupX are named", () => {
    for (const bare of [1, "1", 1n])
      expect(() => eezChainId(bare)).toThrow(
        "a bare 1 is ambiguous here: write mainnet for Ethereum mainnet, or rollupX",
      );
    expect(eezChainId("mainnet")).toBe(1);
    expect(eezChainId("rollupX")).toBe(696991);
    expect(eezChainId(696991)).toBe(696991);
    expect(eezChainId(10200)).toBe(10200);
    expect(() => refuseBareOne(2)).not.toThrow();
    expect(() => refuseBareOne(undefined)).not.toThrow();
  });

  it("names RollupX's chains by key and resolves their rollups", () => {
    expect(rollupIdFor("rollupX")).toBe(2n);
    expect(rollupIdFor("mainnet")).toBe(0n);
    expect(rollupIdFor(696991)).toBe(2n);
    // A bare number is a chain id first: 1 is Ethereum mainnet.
    expect(rollupIdFor(1)).toBe(0n);
  });

  it("lets the gateway probe only where an early look costs nothing", () => {
    // Any contract can revert with the gate's bytes: mainnet transactions
    // reach RollupX's gateway only when a command marked them, or when
    // the registry says their target is a proxy.
    const byId = new Map(chains.map((c) => [c.id, c]));
    expect(byId.get(1)?.crossChainReverts).toBeUndefined();
    expect(byId.get(10200)?.crossChainReverts).toEqual(CROSS_CHAIN_GATES);
  });

  it("tells every gateway chain's proxies apart by that chain's own registry", () => {
    for (const chain of chains)
      expect(chain.crossChainRegistry).toBe(EEZ_CHAINS[chain.id].registry);
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

    // The commands themselves need the devnet (they read the proxies
    // before the block is interpreted); what refuses a `switch` is this
    // check on the actions the block produced, so it is fed real ones.
    for (const [form, script] of [
      ["a bare switch", "if true (\n  switch mainnet\n)"],
      ["a switch with a block", "switch mainnet (\n  print 1\n)"],
    ] as const) {
      it(`eez:on refuses the actions of ${form}`, async () => {
        const actions = await createInterpreter(
          script,
          undefined as never,
        ).interpret();
        expect(actions.length).toBeGreaterThan(0);
        expect(() => assertCrossChainCalls(actions, "eez:on")).toThrow(
          "switch cannot be used inside eez:on",
        );
      });
    }

    it("rejects a batch inside the block, pointing at a Safe", () => {
      const action: Action = {
        type: "batched",
        chainId: 1,
        from: call.to,
        actions: [call, call],
      };
      expect(() => assertCrossChainCalls([call, action], "eez:on")).toThrow(
        /batch cannot be used inside eez:on: .*Safe's block \(safe:execute\)/,
      );
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
      call: () => Promise<unknown> = async () => ({}),
    ) =>
      ({
        getChainId: async () => l1.peerChainId,
        getClient: () => ({ estimateGas, call }),
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
      const gas = await estimateCallGas(module, l1, 2n, target, "0x", proxy, {
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
        estimateCallGas(module, l1, 2n, target, "0x", proxy, {
          failOnRevert: true,
        }),
      ).rejects.toThrow(/would revert on EEZ L2: assertion failed: only Bob/);
    });

    it("asks eth_call when the estimate drops the revert data of a leg that crosses again", async () => {
      // An EEZ composer's estimate answers a nested leg with an empty
      // revert; eth_call keeps the registry's gate error.
      const module = moduleWith(
        async () => {
          throw reverted("0x");
        },
        async () => {
          throw reverted("0xf9d330ad");
        },
      );
      const gas = await estimateCallGas(module, l1, 2n, target, "0x", proxy, {
        failOnRevert: true,
      });
      expect(gas).toBe(CROSS_CHAIN_FALLBACK_GAS);
    });

    it("still refuses a leg that reverts without data both ways", async () => {
      const module = moduleWith(
        async () => {
          throw reverted("0x");
        },
        async () => {
          throw reverted("0x");
        },
      );
      await expect(
        estimateCallGas(module, l1, 2n, target, "0x", proxy, {
          failOnRevert: true,
        }),
      ).rejects.toThrow(/would revert on EEZ L2/);
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
        estimateCallGas(module, l1, 2n, target, "0x", proxy, {
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
          await estimateCallGas(module, l1, 2n, target, "0x", proxy, {
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
        await estimateCallGas(module, l1, 2n, target, "0x", proxy, {
          failOnRevert: true,
        }),
      ).toBe(CROSS_CHAIN_FALLBACK_GAS);
    });

    it("keeps a revert as a gas fallback when the block is collected for later", async () => {
      const module = moduleWith(async () => {
        throw reverted(constraintFailed);
      });
      expect(
        await estimateCallGas(module, l1, 2n, target, "0x", proxy, {
          failOnRevert: false,
        }),
      ).toBe(CROSS_CHAIN_FALLBACK_GAS);
    });
  });
});
