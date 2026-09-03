import "../../setup";
import { expect as bunExpect, describe, it } from "bun:test";
import { executeScript } from "@evmcrispr/core";
import {
  expect,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { describeCommand, evml } from "@evmcrispr/test-utils/evml";
import {
  decodeAbiParameters,
  decodeFunctionData,
  isAddressEqual,
  parseAbi,
  parseAbiParameters,
  toHex,
} from "viem";
import { crossChainProxyAbi, eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS } from "../../../src/constants";
import {
  deployValue,
  devnet,
  ensureFunded,
  L1_ID,
  L2_ID,
  l1,
  l1Wallet,
  l2,
  l2Wallet,
  proxySupportsBatch,
  testAccount,
  VALUE_BYTECODE,
} from "../../devnet";

const valueAbi = parseAbi([
  "function setValue(uint256 v)",
  "function value() view returns (uint256)",
]);
const ownerAbi = parseAbi(["function setOwner(address a)"]);
const { registry } = EEZ_CHAINS[L1_ID];
const KNOWN = "0x000000000000000000000000000000000000bEEF";
const OTHER = `0x${toHex(BigInt(Date.now()), { size: 20 }).slice(2)}` as const;

const proxyOf = (target: `0x${string}`) =>
  l1.readContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [target, 1n],
  });

/** The test account's proxy on L2: what runs the batch over there. */
const selfOnL2 = () =>
  l2.readContract({
    address: EEZ_CHAINS[L2_ID].registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [TEST_ACCOUNT_ADDRESS, 0n],
  });

/** The L1 proxy of that proxy: what every `eez:batch` from L1 calls. */
const ensureSelfProxy = async () => {
  await ensureFunded();
  const self = await selfOnL2();
  const proxy = await proxyOf(self);
  const code = await l1.getCode({ address: proxy });
  if (code && code !== "0x") return;
  const hash = await l1Wallet.writeContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "createCrossChainProxy",
    args: [self, 1n],
  });
  await l1.waitForTransactionReceipt({ hash, timeout: 60_000 });
};

/** The ERC-7579 executions inside an `executeBatch` call. */
const executionsOf = (data: `0x${string}`) => {
  const { functionName, args } = decodeFunctionData({
    abi: crossChainProxyAbi,
    data,
  });
  expect(functionName).to.equal("executeBatch");
  const [executions] = decodeAbiParameters(
    parseAbiParameters("(address target, uint256 value, bytes callData)[]"),
    args[0] as `0x${string}`,
  );
  return executions;
};

const setValueArg = (data: `0x${string}`) =>
  decodeFunctionData({ abi: valueAbi, data }).args[0];

// Shape tests pass `--gas`: until the devnet's proxies carry
// `executeBatch`, simulating the batch over there reverts, and the
// pre-flight would refuse it.
describeCommand("batch", {
  module: "eez",
  preamble: "load eez",
  chainId: L1_ID,
  skip: !devnet,
  cases: [
    {
      name: "sends the whole block as one call to the proxy of your far-side proxy",
      script: [
        "eez:batch eezL2 --gas 900000 (",
        `  exec ${KNOWN} setValue(uint256) 1 --value 2`,
        `  exec ${OTHER} setValue(uint256) 3`,
        ")",
      ].join("\n"),
      timeout: 120_000,
      setup: ensureSelfProxy,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(1);
        const [call] = actions as any[];
        expect(isAddressEqual(call.to, await proxyOf(await selfOnL2()))).to.be
          .true;
        expect(call.value).to.equal(2n);
        expect(call.gas).to.equal(900_000n);
        expect(call.from).to.be.undefined;
        const executions = executionsOf(call.data);
        expect(executions).to.have.lengthOf(2);
        expect(isAddressEqual(executions[0].target, KNOWN)).to.be.true;
        expect(executions[0].value).to.equal(2n);
        expect(setValueArg(executions[0].callData)).to.equal(1n);
        expect(isAddressEqual(executions[1].target, OTHER)).to.be.true;
        expect(executions[1].value).to.equal(0n);
        expect(setValueArg(executions[1].callData)).to.equal(3n);
      },
    },
    {
      name: "runs the block as the caller's proxy on the other chain",
      script: `eez:batch eezL2 --gas 900000 (\n  exec ${KNOWN} setOwner(address) @sender\n)`,
      timeout: 120_000,
      setup: ensureSelfProxy,
      validate: async (actions) => {
        const [call] = actions as any[];
        const remoteProxy = await selfOnL2();
        const [execution] = executionsOf(call.data);
        const [owner] = decodeFunctionData({
          abi: ownerAbi,
          data: execution.callData,
        }).args;
        expect(isAddressEqual(owner, remoteProxy)).to.be.true;
      },
    },
    {
      name: "flattens a batch inside the block and keeps the order",
      script: [
        "eez:batch eezL2 --gas 900000 (",
        `  exec ${KNOWN} setValue(uint256) 1`,
        "  batch (",
        `    exec ${KNOWN} setValue(uint256) 2`,
        `    exec ${KNOWN} setValue(uint256) 3`,
        "  )",
        `  exec ${KNOWN} setValue(uint256) 4`,
        ")",
      ].join("\n"),
      timeout: 120_000,
      setup: ensureSelfProxy,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(1);
        const executions = executionsOf((actions[0] as any).data);
        expect(executions.map((e) => setValueArg(e.callData))).to.eql([
          1n,
          2n,
          3n,
          4n,
        ]);
      },
    },
    {
      name: "creates the proxy of your far-side proxy when missing",
      script: `eez:batch eezL2 --gas 900000 (\n  exec ${KNOWN} setValue(uint256) 1\n)`,
      timeout: 120_000,
      setup: () => ensureFunded(),
      validate: async (actions) => {
        // The create comes first when nobody has batched from this account
        // on this devnet yet; the call is the same either way.
        expect(actions.length).to.be.oneOf([1, 2]);
        const call = actions.at(-1) as any;
        expect(isAddressEqual(call.to, await proxyOf(await selfOnL2()))).to.be
          .true;
        if (actions.length === 2) {
          const [create] = actions as any[];
          expect(isAddressEqual(create.to, registry)).to.be.true;
        }
      },
    },
    {
      name: "produces nothing for an empty block",
      script:
        "eez:batch eezL2 (\n  if false (\n    exec 0x000000000000000000000000000000000000bEEF setValue(uint256) 1\n  )\n)",
      timeout: 120_000,
      validate: (actions) => {
        expect(actions).to.have.lengthOf(0);
      },
    },
  ],
  errorCases: [
    {
      name: "refuses to run the block on the current chain",
      script: `eez:batch eezL1 (\n  exec ${KNOWN} setValue(uint256) 1\n)`,
      error: "itself",
    },
    {
      name: "refuses --from on a command inside",
      script: `eez:batch eezL2 --gas 900000 (\n  exec ${KNOWN} setValue(uint256) 1 --from ${KNOWN}\n)`,
      error: "--from cannot be used inside eez:batch",
    },
    {
      name: "refuses --gas on a command inside",
      script: `eez:batch eezL2 (\n  exec ${KNOWN} setValue(uint256) 1 --gas 100000\n)`,
      error: "--gas cannot be set on a command inside eez:batch",
    },
    {
      name: "refuses a switch inside the block",
      script: `eez:batch eezL2 (\n  switch eezL1\n  exec ${KNOWN} setValue(uint256) 1\n)`,
      error: "switch cannot be used inside eez:batch",
    },
    {
      name: "refuses a deployment inside the block",
      script: `load contracts\neez:batch eezL2 (\n  contracts:deploy $value ${VALUE_BYTECODE}\n)`,
      error: "cannot deploy a contract inside eez:batch",
    },
  ],
});

/**
 * Against a devnet whose proxies carry `executeBatch`: the batch is
 * estimated by simulating it on the rollup, and two writes land in one L1
 * receipt. Probed on the test account's own L2 proxy, which exists once
 * any `eez:on` from it has run.
 */
const farSide =
  devnet &&
  (await proxySupportsBatch(
    l2,
    EEZ_CHAINS[L2_ID].registry,
    TEST_ACCOUNT_ADDRESS,
    0n,
  ));

describeCommand("batch", {
  module: "eez",
  preamble: "load eez",
  chainId: L1_ID,
  skip: !farSide,
  cases: [
    {
      name: "estimates the batch by simulating it whole on the other chain",
      script: `eez:batch eezL2 (\n  exec ${KNOWN} setValue(uint256) 1\n  exec ${KNOWN} setValue(uint256) 2\n)`,
      timeout: 120_000,
      setup: ensureSelfProxy,
      validate: (actions) => {
        expect(actions).to.have.lengthOf(1);
        const [call] = actions as any[];
        expect(call.gas).to.be.a("bigint");
        expect(call.gas >= 300_000n).to.be.true;
      },
    },
  ],
  docCases: [
    {
      description:
        "From L1, two writes on the rollup that either both land or neither does",
      code: "switch eezL1\neez:batch eezL2 (\n  exec 0x000000000000000000000000000000000000bEEF setValue(uint256) 1\n  exec 0x000000000000000000000000000000000000bEEF setOwner(address) @sender\n)",
    },
  ],
});

describe.skipIf(!farSide)("eez:batch > end to end (hosted devnet)", () => {
  it("writes two rollup contracts from L1 in one transaction", async () => {
    await ensureFunded();
    const [first, second] = await Promise.all([
      deployValue(l2Wallet, l2),
      deployValue(l2Wallet, l2),
    ]);
    const stamp = BigInt(Date.now());
    const result = await executeScript(
      [
        "load eez",
        "eez:batch eezL2 (",
        `  exec ${first} setValue(uint256) ${stamp}`,
        `  exec ${second} setValue(uint256) ${stamp + 1n}`,
        ")",
      ].join("\n"),
      evml.registry,
      {
        chainId: L1_ID,
        transports: getTransports(),
        account: testAccount.address,
      },
      l1Wallet,
      { prepareChains: false },
    );
    // The batch, plus the proxy of our L2 proxy if nobody created it yet.
    bunExpect(result.executed.length).toBeGreaterThanOrEqual(1);
    for (const { result: receipt } of result.executed) {
      bunExpect((receipt as any).status).toBe("success");
    }
    const observed = async (address: `0x${string}`) => {
      for (let i = 0; i < 15; i++) {
        try {
          return await l2.readContract({
            address,
            abi: valueAbi,
            functionName: "value",
          });
        } catch {
          await new Promise((r) => setTimeout(r, 2_000));
        }
      }
      throw new Error("rollup RPC never answered");
    };
    bunExpect(await observed(first)).toBe(stamp);
    bunExpect(await observed(second)).toBe(stamp + 1n);
  }, 180_000);
});
