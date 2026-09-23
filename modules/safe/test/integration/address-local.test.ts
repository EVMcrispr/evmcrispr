import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import { createEvml, Interpreter } from "@evmcrispr/core";
import { encodeAction, type TransactionAction } from "@evmcrispr/sdk";
import Factory from "@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json";
import Singleton from "@safe-global/safe-contracts/build/artifacts/contracts/SafeL2.sol/SafeL2.json";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  type PublicClient,
  parseAbi,
} from "viem";
import Safe from "../../src";
import {
  CANONICAL_DEPLOYMENT,
  CREATE2_DEPLOYMENT,
  SENTINEL,
  safeDeployment,
} from "../../src/addresses";
import { safeAbi } from "../../src/utils/reads";
import {
  buildSafeTx,
  encodeExecTransaction,
  preValidatedSignature,
} from "../../src/utils/safeTx";

const chainId = 31337;
const tag = createEvml().use(Safe);
let process: ReturnType<typeof Bun.spawn>;
let transport: ReturnType<typeof http>;
let client: PublicClient;
let wallet: ReturnType<typeof createWalletClient>;
let owner: Address;
let stranger: Address;

const compile = async (script: string, selectedChain = chainId) => {
  const logs: string[] = [];
  const actions = await new Interpreter(tag.registry, {
    account: owner,
    chainId: selectedChain,
    onLog: (message) => logs.push(message),
    transports: { [selectedChain]: transport },
  }).interpret(`load safe\n${script}`);
  return { actions, logs };
};

const submit = async (action: TransactionAction, sender = owner) => {
  const hash = await wallet.sendTransaction({
    account: sender,
    chain: null,
    to: action.to,
    data: action.data,
    value: action.value,
    gas: 5_000_000n,
  });
  return client.waitForTransactionReceipt({ hash });
};

beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process = Bun.spawn(
    [
      "anvil",
      "--port",
      String(port),
      "--chain-id",
      String(chainId),
      "--silent",
    ],
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
  [owner, stranger] = (await client.request({
    method: "eth_accounts",
  } as never)) as Address[];
  wallet = createWalletClient({ account: owner, transport });
  for (const deployment of [CANONICAL_DEPLOYMENT, CREATE2_DEPLOYMENT]) {
    for (const [address, artifact] of [
      [deployment.proxyFactory, Factory],
      [deployment.l2Singleton, Singleton],
    ] as const)
      await client.request({
        method: "anvil_setCode",
        params: [address, artifact.deployedBytecode],
      } as never);
  }
});

afterAll(() => process?.kill());

describe("safe:new and @safe:address (isolated local chain)", () => {
  for (const selectedChain of [chainId, 7331]) {
    for (const nonce of [0n, 42n]) {
      it(`matches factory deployment for profile ${selectedChain}, nonce ${nonce}`, async () => {
        const { actions, logs } = await compile(
          `print @safe:address(${owner} ${nonce})
safe:new ${owner} --salt ${nonce}`,
          selectedChain,
        );
        const predicted = logs[0] as Address;
        expect(await client.getCode({ address: predicted })).toBeUndefined();
        // Paying for deployment does not make the payer an owner.
        const receipt = await submit(actions[0] as TransactionAction, stranger);
        expect(receipt.status).toBe("success");
        const deployment = safeDeployment(selectedChain);
        const created = receipt.logs.find(
          (log) =>
            log.address.toLowerCase() === deployment.proxyFactory.toLowerCase(),
        )!;
        const event = decodeEventLog({
          abi: parseAbi([
            "event ProxyCreation(address indexed proxy, address singleton)",
          ]),
          data: created.data,
          topics: created.topics,
        });
        expect(event.args.proxy.toLowerCase()).toBe(predicted.toLowerCase());
        expect(
          await client.readContract({
            address: predicted,
            abi: safeAbi,
            functionName: "getOwners",
          }),
        ).toEqual([getAddress(owner)]);
        expect(
          await client.readContract({
            address: predicted,
            abi: safeAbi,
            functionName: "getThreshold",
          }),
        ).toBe(1n);
        expect(logs[1]).toBe(`Deploying new Safe at ${predicted}`);
      });
    }
  }

  it("keeps predicting the original address after ownership changes", async () => {
    const script = `print @safe:address(${owner} 42)`;
    const safe = (await compile(script)).logs[0] as Address;
    const change = encodeAction(safe, "swapOwner(address,address,address)", [
      SENTINEL,
      owner,
      stranger,
    ]);
    const action = encodeExecTransaction(
      safe,
      buildSafeTx([change], 0n),
      preValidatedSignature(owner),
    );
    expect((await submit(action)).status).toBe("success");
    expect(
      await client.readContract({
        address: safe,
        abi: safeAbi,
        functionName: "getOwners",
      }),
    ).toEqual([getAddress(stranger)]);
    expect((await compile(script)).logs[0]).toBe(safe);
  });
});
