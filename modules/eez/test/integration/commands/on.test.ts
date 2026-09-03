import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  decodeFunctionData,
  getAddress,
  isAddressEqual,
  parseAbi,
  toHex,
} from "viem";
import { eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS, EEZ_L2_PREDEPLOY } from "../../../src/constants";
import {
  devnet,
  ensureFunded,
  L1_ID,
  L2_ID,
  l1,
  l1Wallet,
  l2,
  l2Wallet,
  VALUE_BYTECODE,
} from "../../devnet";

const valueAbi = parseAbi(["function setValue(uint256 v)"]);
const ownerAbi = parseAbi(["function setOwner(address a)"]);
const { registry } = EEZ_CHAINS[L1_ID];
const freshAddress = (offset: bigint): `0x${string}` =>
  `0x${toHex(BigInt(Date.now()) + offset, { size: 20 }).slice(2)}`;
/** Targets nobody has proxied: fresh per run, so the create action is emitted. */
const fresh = freshAddress(1n);
const fresh2 = freshAddress(2n);
const fresh4 = freshAddress(4n);
/** Stable target whose proxy the setup below makes sure exists. */
const KNOWN = "0x000000000000000000000000000000000000bEEF";

const proxyOf = (target: `0x${string}`) =>
  l1.readContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [target, 1n],
  });

const ensureKnownProxy = async () => {
  await ensureFunded();
  const proxy = await proxyOf(KNOWN);
  const code = await l1.getCode({ address: proxy });
  if (code && code !== "0x") return;
  const hash = await l1Wallet.writeContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "createCrossChainProxy",
    args: [KNOWN, 1n],
  });
  await l1.waitForTransactionReceipt({ hash, timeout: 60_000 });
};

/** Make sure `original` (an address on the other side) has its proxy on
 *  `side`, and return that proxy: the building block of nested hops. */
const ensureProxyOn = async (
  side: "l1" | "l2",
  original: `0x${string}`,
): Promise<`0x${string}`> => {
  const [client, wallet, chainId, originalRollup] =
    side === "l1"
      ? ([l1, l1Wallet, L1_ID, 1n] as const)
      : ([l2, l2Wallet, L2_ID, 0n] as const);
  const proxy = await client.readContract({
    address: EEZ_CHAINS[chainId].registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [original, originalRollup],
  });
  const code = await client.getCode({ address: proxy });
  if (code && code !== "0x") return proxy;
  const hash = await wallet.writeContract({
    address: EEZ_CHAINS[chainId].registry,
    abi: eezBaseAbi,
    functionName: "createCrossChainProxy",
    args: [original, originalRollup],
  });
  await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  return proxy;
};

const createProxyArgs = (data: `0x${string}`) => {
  const [original, rollupId] = decodeFunctionData({ abi: eezBaseAbi, data })
    .args as readonly [`0x${string}`, bigint];
  return [getAddress(original), rollupId];
};

const setValueArg = (data: `0x${string}`) =>
  decodeFunctionData({ abi: valueAbi, data }).args[0];

describeCommand("on", {
  module: "eez",
  preamble: "load eez",
  chainId: L1_ID,
  skip: !devnet,
  cases: [
    {
      name: "creates a missing proxy, then calls through it via the ingress",
      script: `eez:on eezL2 (\n  exec ${fresh} setValue(uint256) 42\n)`,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(2);
        const [create, call] = actions as any[];
        expect(isAddressEqual(create.to, registry)).to.be.true;
        expect(create.rpcUrl).to.be.undefined;
        expect(isAddressEqual(call.to, await proxyOf(fresh))).to.be.true;
        expect(call.rpcUrl).to.be.undefined;
        expect(call.chainId).to.be.undefined;
        // Estimated for the caller: nothing at `fresh` on the rollup, so
        // the remote simulation is a plain call and the floor applies.
        expect(call.gas).to.be.a("bigint");
        expect(call.gas >= 300_000n).to.be.true;
        expect(setValueArg(call.data)).to.equal(42n);
      },
    },
    {
      name: "skips creation when the proxy already exists and honours the inner value and gas",
      script: `eez:on eezL2 (\n  exec ${KNOWN} setValue(uint256) 7 --value 1 --gas 700000\n)`,
      timeout: 120_000,
      setup: ensureKnownProxy,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(1);
        const [call] = actions as any[];
        expect(isAddressEqual(call.to, await proxyOf(KNOWN))).to.be.true;
        expect(call.value).to.equal(1n);
        expect(call.gas).to.equal(700000n);
        expect(call.rpcUrl).to.be.undefined;
      },
    },
    {
      name: "rewrites every call a loop produces",
      script: `eez:on eezL2 (\n  loop $i of [1 2] (\n    exec ${KNOWN} setValue(uint256) $i\n  )\n)`,
      timeout: 120_000,
      setup: ensureKnownProxy,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(2);
        const proxy = await proxyOf(KNOWN);
        for (const call of actions as any[]) {
          expect(isAddressEqual(call.to, proxy)).to.be.true;
        }
        expect((actions as any[]).map((a) => setValueArg(a.data))).to.eql([
          1n,
          2n,
        ]);
      },
    },
    {
      name: "creates each missing proxy once, however many calls target it",
      timeout: 120_000,
      script: [
        "eez:on eezL2 (",
        "  if true (",
        `    exec ${fresh2} setValue(uint256) 1`,
        "  )",
        `  exec ${fresh2} setValue(uint256) 2`,
        ")",
      ].join("\n"),
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(3);
        const [create, first, second] = actions as any[];
        expect(isAddressEqual(create.to, registry)).to.be.true;
        const proxy = await proxyOf(fresh2);
        expect(isAddressEqual(first.to, proxy)).to.be.true;
        expect(isAddressEqual(second.to, proxy)).to.be.true;
        expect(setValueArg(first.data)).to.equal(1n);
        expect(setValueArg(second.data)).to.equal(2n);
      },
    },
    {
      name: "resolves helpers inside the block against the designated chain",
      // No `switch` inside: the block itself puts the script on the target
      // chain, so @eez:proxy computes with that chain's registry.
      script: `eez:on eezL2 (\n  exec ${KNOWN} setOwner(address) @eez:proxy(eezL1 ${KNOWN})\n)`,
      timeout: 120_000,
      setup: ensureKnownProxy,
      validate: async (actions) => {
        const [call] = actions as any[];
        const onL2 = await l2.readContract({
          address: EEZ_CHAINS[L2_ID].registry,
          abi: eezBaseAbi,
          functionName: "computeCrossChainProxyAddress",
          args: [KNOWN, 0n],
        });
        const [arg] = decodeFunctionData({
          abi: ownerAbi,
          data: call.data,
        }).args;
        expect(isAddressEqual(arg, onL2)).to.be.true;
      },
    },
    {
      name: "runs the block as the caller's proxy on the other chain",
      script: `eez:on eezL2 (\n  exec ${KNOWN} setOwner(address) @sender\n)`,
      timeout: 120_000,
      setup: ensureKnownProxy,
      validate: async (actions) => {
        const [call] = actions as any[];
        // The rollup sees L1 accounts through their proxy on the rollup's
        // own registry: proxy(me, rollup 0) computed on L2.
        const remoteProxy = await l2.readContract({
          address: EEZ_CHAINS[L2_ID].registry,
          abi: eezBaseAbi,
          functionName: "computeCrossChainProxyAddress",
          args: [TEST_ACCOUNT_ADDRESS, 0n],
        });
        const [owner] = decodeFunctionData({
          abi: ownerAbi,
          data: call.data,
        }).args;
        expect(isAddressEqual(owner, remoteProxy)).to.be.true;
      },
    },
    {
      name: "routes a nested block back home through a proxy of a proxy",
      // L1 → L2 → L1: the inner block's call to KNOWN goes through KNOWN's
      // proxy on L2, and that proxy's own proxy on L1 is what we send to.
      script: `eez:on eezL2 (\n  eez:on eezL1 (\n    exec ${KNOWN} setValue(uint256) 1\n  )\n)`,
      timeout: 120_000,
      setup: async () => {
        await ensureFunded();
        await ensureProxyOn("l1", await ensureProxyOn("l2", KNOWN));
      },
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(1);
        const [call] = actions as any[];
        const hop = await ensureProxyOn("l2", KNOWN);
        expect(isAddressEqual(call.to, await proxyOf(hop))).to.be.true;
        expect(setValueArg(call.data)).to.equal(1n);
        // The inner leg's estimate (floored: nothing lives at KNOWN) plus
        // the sending chain's own overhead for the extra hop; the outer
        // block cannot simulate a leg that is itself a proxy call.
        expect(call.gas).to.equal(300_000n + 250_000n);
      },
    },
    {
      name: "creates the missing proxies of a nested block on both chains",
      script: `eez:on eezL2 (\n  eez:on eezL1 (\n    exec ${fresh4} setValue(uint256) 2\n  )\n)`,
      timeout: 120_000,
      setup: async () => {
        await ensureFunded();
        // The L2 registry's proxy on L1 is a one-off per devnet.
        await ensureProxyOn("l1", EEZ_L2_PREDEPLOY);
      },
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(3);
        const [createHome, createRemote, call] = actions as any[];
        const hop = await l2.readContract({
          address: EEZ_CHAINS[L2_ID].registry,
          abi: eezBaseAbi,
          functionName: "computeCrossChainProxyAddress",
          args: [fresh4, 0n],
        });
        // The L1 proxy of the L2 hop: a plain transaction on L1.
        expect(isAddressEqual(createHome.to, registry)).to.be.true;
        expect(createProxyArgs(createHome.data)).to.eql([getAddress(hop), 1n]);
        // The L2 proxy of the target: created on L2 by calling the L2
        // registry through its proxy on L1, atomically with the rest.
        expect(isAddressEqual(createRemote.to, await proxyOf(EEZ_L2_PREDEPLOY)))
          .to.be.true;
        expect(createProxyArgs(createRemote.data)).to.eql([
          getAddress(fresh4),
          0n,
        ]);
        expect(isAddressEqual(call.to, await proxyOf(hop))).to.be.true;
        expect(setValueArg(call.data)).to.equal(2n);
      },
    },
    {
      name: "nests three hops deep",
      // L1 → L2 → L1 → L2: the devnet composes it (probed 2026-09-03 to
      // four hops); each hop adds the sending chain's overhead.
      script: [
        "eez:on eezL2 (",
        "  eez:on eezL1 (",
        "    eez:on eezL2 (",
        `      exec ${KNOWN} setValue(uint256) 3`,
        "    )",
        "  )",
        ")",
      ].join("\n"),
      timeout: 120_000,
      setup: async () => {
        await ensureFunded();
        const first = await ensureProxyOn("l1", KNOWN);
        await ensureProxyOn("l1", await ensureProxyOn("l2", first));
      },
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(1);
        const [call] = actions as any[];
        const first = await proxyOf(KNOWN);
        const second = await ensureProxyOn("l2", first);
        expect(isAddressEqual(call.to, await proxyOf(second))).to.be.true;
        expect(setValueArg(call.data)).to.equal(3n);
        expect(call.gas).to.equal(300_000n + 2n * 250_000n);
      },
    },
  ],
  errorCases: [
    {
      name: "refuses to run the block on the current chain",
      script: `eez:on eezL1 (\n  exec ${KNOWN} setValue(uint256) 1\n)`,
      error: "itself",
    },
    {
      name: "refuses a chain that is not an EEZ chain",
      script: `eez:on mainnet (\n  exec ${KNOWN} setValue(uint256) 1\n)`,
      error: "not a known EEZ chain",
    },
    {
      name: "refuses a switch inside the block",
      script: `eez:on eezL2 (\n  switch eezL1\n  exec ${KNOWN} setValue(uint256) 1\n)`,
      error: "switch cannot be used inside eez:on",
    },
    {
      name: "refuses a deployment inside the block",
      script: `load contracts\neez:on eezL2 (\n  contracts:deploy $value ${VALUE_BYTECODE}\n)`,
      error: "cannot deploy a contract inside eez:on",
    },
    {
      name: "refuses a batch inside the block: the wallet batch goes outside",
      script: [
        "eez:on eezL2 (",
        "  batch (",
        `    exec ${KNOWN} setValue(uint256) 2`,
        `    exec ${KNOWN} setValue(uint256) 3`,
        "  )",
        ")",
      ].join("\n"),
      error: "batch cannot be used inside eez:on",
    },
  ],
  docCases: [
    {
      description:
        "From L1, set a value on a rollup contract in one atomic transaction",
      code: "switch eezL1\neez:on eezL2 (\n  exec 0x000000000000000000000000000000000000bEEF setValue(uint256) 42\n)",
    },
  ],
});
