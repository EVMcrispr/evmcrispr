import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import { createEvml, Interpreter } from "@evmcrispr/core";
import Sim from "@evmcrispr/module-sim";
import Vault from "@evmcrispr/module-vault";
import { encodeAction, type SmartBatchAction } from "@evmcrispr/sdk";
import {
  COMPOSABLE_EXECUTOR_ADDRESS,
  COMPOSABLE_STORAGE_ADDRESS,
  CORE_ADDRESS,
  type Constraint,
  checkSmartAccountReceipt,
  constraint,
  constrainWord,
  createSmartBatchState,
  defaultCompileCtx,
  encodeAssertParam,
  encodeComposable,
  encodeResolve,
  type InputParam,
  prepareSmartAccountSimulation,
  prepareSmartAccountTransaction,
  rawParam,
  runtimeValue,
  type SmartBatchPlan,
  toWord,
  withSmartCompileContext,
} from "@evmcrispr/sdk/onchain";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  custom,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  type PublicClient,
  parseAbi,
} from "viem";
import {
  type ActionHandlerCtx,
  makeDefaultHandlers,
} from "../../../../packages/core/src/evml/execute";
import artifacts from "../../../../packages/test-utils/src/onchain/fixtures/erc8211.json";
import protocolArtifact from "../../../../packages/test-utils/src/onchain/fixtures/smart-protocol.json";
import {
  installAssertionsCore,
  installMockTarget,
  MOCK_TARGET_ADDRESS,
} from "../../../../packages/test-utils/src/onchain/install";
import {
  deploySmartAccount,
  fixtureOwner,
} from "../../../../packages/test-utils/src/onchain/smart-account";
import {
  decodeCallScript,
  encodeSmartCallScript,
} from "../../../aragonos/src/utils/evmscripts";

let process: ReturnType<typeof Bun.spawn>;
let client: PublicClient;
let wallet: ReturnType<typeof createWalletClient>;
let transport: ReturnType<typeof http>;
const target = MOCK_TARGET_ADDRESS;
const tag = createEvml().use(Vault, Sim);
const readAbi = parseAbi([
  "function getValue() view returns (uint256)",
  "function getAddress() view returns (address)",
]);
const compile = async (account: Address, body: string) =>
  (
    await new Interpreter(tag.registry, {
      account,
      chainId: 1,
      transports: { 1: transport },
    }).interpret(`load vault\nbatch! (\n${body}\n)`)
  )[0] as SmartBatchAction;

beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process = Bun.spawn(
    ["anvil", "--port", String(port), "--chain-id", "1", "--silent"],
    { stdout: "ignore", stderr: "pipe" },
  );
  transport = http(`http://127.0.0.1:${port}`, { retryCount: 0 });
  client = createPublicClient({ transport });
  for (let attempt = 0; ; attempt++) {
    try {
      await client.getChainId();
      break;
    } catch (error) {
      if (attempt > 50) throw error;
      await Bun.sleep(40);
    }
  }
  wallet = createWalletClient({ account: fixtureOwner, transport });
  await client.request({
    method: "anvil_setCode",
    params: [COMPOSABLE_EXECUTOR_ADDRESS, artifacts.executor],
  } as never);
  await client.request({
    method: "anvil_setCode",
    params: [COMPOSABLE_STORAGE_ADDRESS, artifacts.storage],
  } as never);
  await installAssertionsCore(client);
  await installMockTarget(client);
});
afterAll(() => process?.kill());

it("resolves packed CallsScript targets and unaligned dynamic calldata exactly on chain", async () => {
  const evm = new Interpreter(tag.registry, {
    account: fixtureOwner.address,
    chainId: 1,
    transports: { 1: transport },
  });
  const module = evm.getModule("std")!;
  const plan: SmartBatchPlan = {
    version: 1,
    salt: `0x${"a1".repeat(32)}`,
    chainId: 1,
    account: fixtureOwner.address,
    route: "executor",
    executor: COMPOSABLE_EXECUTOR_ADDRESS,
    storage: COMPOSABLE_STORAGE_ADDRESS,
    steps: [],
    captures: [],
    dependencies: [],
  };
  const interpreters = {
    interpretNode: evm.interpretNode,
    interpretNodes: evm.interpretNodes,
  };
  const state = createSmartBatchState(plan, interpreters);
  const ctx = defaultCompileCtx(module, {
    ...interpreters,
    batchContext: {
      name: "batch!",
      smart: true,
      smartState: state,
      hasActions: false,
    },
  });
  for (const length of [0, 1, 31, 32, 33]) {
    const payload = `0x${"ab".repeat(length)}` as const;
    const value = runtimeValue(
      rawParam(encodeAbiParameters([{ type: "bytes" }], [payload])),
      { type: "bytes" },
      plan.salt,
    );
    const to = runtimeValue(
      rawParam(toWord(BigInt(target))),
      { type: "address" },
      plan.salt,
    );
    const result = await withSmartCompileContext(module, ctx, async () =>
      encodeSmartCallScript(module, [encodeAction(to, "f(bytes)", [value])]),
    );
    if (typeof result === "string")
      throw Error("expected a runtime CallsScript");
    const resolved = await client.call({
      to: CORE_ADDRESS,
      data: encodeResolve(result.operand.param),
    });
    const [script] = decodeAbiParameters([{ type: "bytes" }], resolved.data!);
    const data = encodeFunctionData({
      abi: parseAbi(["function f(bytes)"]),
      functionName: "f",
      args: [payload],
    });
    expect(decodeCallScript(script)).toEqual([
      { to: target.toLowerCase() as Address, data },
    ]);
  }
});

describe("shared positional constraints", () => {
  it("uses the same canonical predicates in Assertions and the Biconomy executor", async () => {
    const either = (checks: Constraint[]): Constraint => ({
      constraintType: 6,
      referenceData: encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: [
              { name: "constraintType", type: "uint8" },
              { name: "referenceData", type: "bytes" },
            ],
          },
        ],
        [checks],
      ),
    });
    const cases: [InputParam, boolean][] = [];
    for (const value of [0n, 1n, 42n, 100n, 101n]) {
      cases.push([
        constrainWord(
          { core: CORE_ADDRESS },
          rawParam(toWord(value), [constraint("Lte", 100n)]),
          constraint("Gte", 1n),
        ),
        value >= 1n && value <= 100n,
      ]);
    }
    for (const value of [-11n, -10n, 0n, 10n, 11n]) {
      cases.push([
        rawParam(toWord(value), [
          {
            constraintType: 8,
            referenceData: `${toWord(-10n)}${toWord(10n).slice(2)}`,
          },
        ]),
        value >= -10n && value <= 10n,
      ]);
    }
    for (const value of [0n, 42n, 43n])
      cases.push([
        rawParam(toWord(value), [
          either([constraint("Eq", 0n), constraint("Eq", 42n)]),
        ]),
        value !== 43n,
      ]);
    for (const second of [9n, 10n])
      cases.push([
        rawParam(`${toWord(42n)}${toWord(second).slice(2)}`, [
          { constraintType: 7, referenceData: "0x" },
          constraint("Eq", 9n),
        ]),
        second === 9n,
      ]);
    for (const [param, expected] of cases) {
      for (const [to, data] of [
        [CORE_ADDRESS, encodeAssertParam(param)],
        [
          COMPOSABLE_EXECUTOR_ADDRESS,
          encodeComposable(
            [
              {
                functionSig: "0x00000000",
                inputParams: [param],
                outputParams: [],
              },
            ],
            "executor",
          ),
        ],
      ] as const) {
        const call = client.call({ account: fixtureOwner.address, to, data });
        if (expected) await call;
        else await expect(call).rejects.toThrow();
      }
    }
  });
});

for (const kind of ["nexus", "kernel"] as const)
  describe(`${kind} authenticated ERC-7579 smart batches`, () => {
    let account: Awaited<ReturnType<typeof deploySmartAccount>>;
    let protocol: Address;
    beforeAll(async () => {
      account = await deploySmartAccount(client, wallet, kind);
      const receipt = await client.waitForTransactionReceipt({
        hash: await wallet.deployContract({
          account: fixtureOwner,
          chain: null,
          abi: protocolArtifact.abi,
          bytecode: protocolArtifact.bytecode as `0x${string}`,
        }),
      });
      protocol = receipt.contractAddress!;
    }, 20_000);
    const readValue = () =>
      client.readContract({
        address: target,
        abi: readAbi,
        functionName: "getValue",
      });
    const submit = async (body: string) => {
      const action = await compile(account.address, body);
      const simulation = await prepareSmartAccountSimulation(
        client,
        action.plan,
      );
      await client.call({
        account: simulation.from,
        to: simulation.to,
        data: simulation.data,
      });
      const prepared = await prepareSmartAccountTransaction(
        client,
        action.plan,
      );
      const calls = "type" in prepared ? prepared.actions : [prepared];
      const hash = await account.submit(calls);
      return client.waitForTransactionReceipt({ hash });
    };
    it("preserves caller identity, capture namespaces and account ownership", async () => {
      await submit(
        `exec ${target} "setValue(uint256)" 82\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" @calc!($x + 1)\nexec ${target} "caller() returns (address)" -> [$caller]\nexec ${target} "setAddress(address)" $caller`,
      );
      expect(await readValue()).toBe(83n);
      expect(
        (
          await client.readContract({
            address: target,
            abi: readAbi,
            functionName: "getAddress",
          })
        ).toLowerCase(),
      ).toBe(account.address.toLowerCase());
      expect(String(await account.owner()).toLowerCase()).toBe(
        fixtureOwner.address.toLowerCase(),
      );
    });
    it("interleaves exact native transfers and smart segments in an authenticated outer batch", async () => {
      const before = await client.getBalance({ address: fixtureOwner.address });
      const accountBefore = await client.getBalance({
        address: account.address,
      });
      await submit(
        `exec ${target} "setValue(uint256)" 41\nsend ${fixtureOwner.address} --value 123\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" @calc!($x + 1)`,
      );
      expect(await readValue()).toBe(42n);
      expect(
        await client.getBalance({ address: account.address }),
      ).toBeLessThanOrEqual(accountBefore - 123n);
      expect(before).toBeGreaterThan(0n);
    });
    it("reverts all steps when a later call fails", async () => {
      const previous = await readValue();
      const action = await compile(
        account.address,
        `exec ${target} "setValue(uint256)" 999\nexec ${target} "revertingFunction()"`,
      );
      const prepared = await prepareSmartAccountTransaction(
        client,
        action.plan,
      );
      await client.waitForTransactionReceipt({
        hash: await account.submit(
          "type" in prepared ? prepared.actions : [prepared],
        ),
      });
      expect(await readValue()).toBe(previous);
    });
    it("snapshots a runtime approval amount once, zero-resets and captures the primary protocol output", async () => {
      await client.waitForTransactionReceipt({
        hash: await account.submit([
          {
            to: protocol,
            data: encodeFunctionData({
              abi: protocolArtifact.abi,
              functionName: "approve",
              args: [protocol, 50n],
            }),
          },
        ]),
      });
      await client.waitForTransactionReceipt({
        hash: await wallet.writeContract({
          account: fixtureOwner,
          chain: null,
          address: protocol,
          abi: protocolArtifact.abi,
          functionName: "reset",
        }),
      });
      await submit(
        `vault:deposit @balance!(${protocol} @sender) into ${protocol} -> [$shares]\nexec ${target} "setValue(uint256)" $shares`,
      );
      expect(
        await client.readContract({
          address: protocol,
          abi: protocolArtifact.abi,
          functionName: "deposited",
        }),
      ).toBe(7n);
      expect(
        await client.readContract({
          address: protocol,
          abi: protocolArtifact.abi,
          functionName: "zeroResets",
        }),
      ).toBe(1n);
      expect(
        await client.readContract({
          address: protocol,
          abi: protocolArtifact.abi,
          functionName: "approvals",
        }),
      ).toBe(2n);
      expect(await readValue()).toBe(14n);
    });
    it("executes nested ABI inputs and destructures static tuples, arrays and ignored outputs", async () => {
      await submit(
        `exec ${protocol} "outputs() returns (uint256,(uint256,address),bool,bytes4,uint256[2])" -> [$a [$b _] $ok $tag [$c $d]]\nexec ${protocol} "nested((uint256,address)[],string,bytes)" [[@calc!($a + $b + $c + $d) @sender]] "hello" 0x1234`,
      );
      expect(
        await client.readContract({
          address: protocol,
          abi: protocolArtifact.abi,
          functionName: "deposited",
        }),
      ).toBe(26n);
      expect(
        String(
          await client.readContract({
            address: protocol,
            abi: protocolArtifact.abi,
            functionName: "receiver",
          }),
        ).toLowerCase(),
      ).toBe(account.address.toLowerCase());
    });
    it("uses the connected provider for a mixed authenticated batch and rejects wallet identity/mode failures before signing", async () => {
      let submitted = 0;
      let rejectWallet = false;
      const provider = createWalletClient({
        account: account.address,
        transport: custom({
          request: async ({ method, params }) => {
            if (method === "eth_accounts" || method === "eth_requestAccounts")
              return [account.address];
            if (method === "eth_chainId") return "0x1";
            if (method === "wallet_switchEthereumChain") return null;
            if (method === "wallet_sendCalls") {
              if (rejectWallet) throw new Error("wallet rejected smart batch");
              submitted++;
              const request = (params as any[])[0];
              expect(request.atomicRequired).toBe(true);
              return {
                id: await account.submit(
                  request.calls.map((call: any) => ({
                    to: call.to,
                    data: call.data,
                    value: BigInt(call.value ?? 0),
                  })),
                ),
              };
            }
            if (method === "wallet_getCallsStatus") {
              const hash = (params as any[])[0];
              const receipt = await client.waitForTransactionReceipt({ hash });
              return {
                version: "2.0.0",
                id: hash,
                chainId: "0x1",
                atomic: true,
                status: receipt.status === "success" ? 200 : 500,
                receipts: [
                  {
                    status: receipt.status === "success" ? "0x1" : "0x0",
                    logs: receipt.logs,
                    transactionHash: hash,
                    blockHash: receipt.blockHash,
                    blockNumber: `0x${receipt.blockNumber.toString(16)}`,
                    gasUsed: `0x${receipt.gasUsed.toString(16)}`,
                  },
                ],
              };
            }
            throw new Error(`Unexpected wallet method ${method}`);
          },
        }),
      });
      const handlers = makeDefaultHandlers({
        account: account.address,
        maximizeGasLimit: false,
      });
      const ctx: ActionHandlerCtx = {
        walletClient: provider,
        getPublicClient: () => client,
        onLog: () => {},
        next: async (action) =>
          "type" in action && action.type === "batched"
            ? handlers.batched(action, ctx)
            : handlers.transaction(action as any, ctx),
      };
      const action = await compile(
        account.address,
        `exec ${target} "setValue(uint256)" 93\nsend ${fixtureOwner.address} --value 1\nexec ${target} "getValue() returns (uint256)" -> [$x]`,
      );
      await handlers.smartBatch(action, ctx);
      expect(submitted).toBe(1);
      expect(await readValue()).toBe(93n);
      const wrong = { ...ctx, walletClient: wallet };
      await expect(handlers.smartBatch(action, wrong)).rejects.toThrow(
        "smart-account address",
      );
      const modes = {
        ...client,
        readContract: async (args: any) =>
          args.functionName === "supportsExecutionMode"
            ? false
            : client.readContract(args),
      };
      await expect(
        prepareSmartAccountTransaction(modes as any, action.plan),
      ).rejects.toThrow("reverting single");
      await expect(
        prepareSmartAccountTransaction(
          { ...client, getChainId: async () => 10 } as any,
          action.plan,
        ),
      ).rejects.toThrow("RPC chain");
      await expect(
        prepareSmartAccountTransaction(
          { ...client, getCode: async () => "0x1234" } as any,
          action.plan,
        ),
      ).rejects.toThrow("bytecode");
      expect(submitted).toBe(1);
      rejectWallet = true;
      await expect(handlers.smartBatch(action, ctx)).rejects.toThrow(
        "wallet rejected smart batch",
      );
      expect(submitted).toBe(1);
    });
    it("reverts earlier protocol writes when an assertion fails", async () => {
      const before = await readValue();
      const action = await compile(
        account.address,
        `exec ${target} "setValue(uint256)" 987\nassert @balance!(ETH @sender) > 1000000000000000000000000000000000`,
      );
      const tx = await prepareSmartAccountTransaction(client, action.plan);
      const receipt = await client.waitForTransactionReceipt({
        hash: await account.submit("type" in tx ? tx.actions : [tx]),
      });
      expect(await readValue()).toBe(before);
      if (kind === "kernel") expect(receipt.status).toBe("reverted");
      else
        expect(() =>
          checkSmartAccountReceipt(action.plan, account.entryPoint, receipt),
        ).toThrow("UserOperation reverted");
    });
    it("simulates the installed account through its EntryPoint on ethereumjs", async () => {
      const before = await readValue();
      const interpreter = new Interpreter(tag.registry, {
        account: account.address,
        chainId: 1,
        transports: { 1: transport },
      });
      await interpreter.interpret(
        `load sim\nsim:fork --using ethereumjs (\nbatch! (\nexec ${target} "setValue(uint256)" 615\nexec ${target} "caller() returns (address)" -> [$caller]\nexec ${target} "setAddress(address)" $caller\n)\nsim:expect @bool(@get(${target} "getValue()(uint256)") == 615)\nsim:expect @bool(@get(${target} "getAddress()(address)") == @sender)\n)`,
      );
      expect(await readValue()).toBe(before);
    }, 30_000);
    it("rejects accounts without the installed executor before submission", async () => {
      const missing = await deploySmartAccount(client, wallet, kind, false);
      const action = await compile(
        missing.address,
        `exec ${target} "setValue(uint256)" 11`,
      );
      await expect(
        prepareSmartAccountTransaction(client, action.plan),
      ).rejects.toThrow("already be installed");
    }, 20_000);
  });
