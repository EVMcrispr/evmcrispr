import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import { createEvml, Interpreter } from "@evmcrispr/core";
import type { TransactionAction } from "@evmcrispr/sdk";
import { BindingsSpace } from "@evmcrispr/sdk";
import {
  COMPOSABLE_EXECUTOR_ADDRESS,
  COMPOSABLE_STORAGE_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import MultiSendArtifact from "@safe-global/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";
import ProxyArtifact from "@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json";
import SafeArtifact from "@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from "viem";
import artifacts from "../../../../packages/test-utils/src/onchain/fixtures/erc8211.json";
import {
  installAssertionsCore,
  installMockTarget,
  MOCK_TARGET_ADDRESS,
} from "../../../../packages/test-utils/src/onchain/install";
import Safe from "../../src";
import { MULTISEND } from "../../src/addresses";

let process: ReturnType<typeof Bun.spawn>;
let client: PublicClient;
let wallet: ReturnType<typeof createWalletClient>;
let safe: Address;
let owner: Address;
let transport: ReturnType<typeof http>;
const tag = createEvml().use(Safe);
const target = MOCK_TARGET_ADDRESS;
const readAbi = parseAbi([
  "function getValue() view returns (uint256)",
  "function getAddress() view returns (address)",
]);
const compile = async (body: string, salt = "") => {
  const interpreter = new Interpreter(tag.registry, {
    account: owner,
    chainId: 1,
    transports: { 1: transport },
  });
  return (
    await interpreter.interpret(
      `load safe\nsafe:execute ${safe} ${salt} !(\n${body}\n)`,
    )
  )[0] as TransactionAction;
};
const submit = async (action: TransactionAction) => {
  const hash = await wallet.sendTransaction({
    account: owner,
    chain: null,
    to: action.to,
    data: action.data,
    value: action.value,
    gas: 12_000_000n,
  });
  return client.waitForTransactionReceipt({ hash });
};

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
  const accounts = (await client.request({
    method: "eth_accounts",
  } as never)) as Address[];
  owner = accounts[0];
  wallet = createWalletClient({ account: owner, transport });
  await client.request({
    method: "anvil_setCode",
    params: [COMPOSABLE_EXECUTOR_ADDRESS, artifacts.executor],
  } as never);
  await client.request({
    method: "anvil_setCode",
    params: [COMPOSABLE_STORAGE_ADDRESS, artifacts.storage],
  } as never);
  const multiSendHash = await wallet.deployContract({
    account: owner,
    chain: null,
    abi: MultiSendArtifact.abi,
    bytecode: MultiSendArtifact.bytecode as Hex,
  });
  const multiSendAddress = (
    await client.waitForTransactionReceipt({ hash: multiSendHash })
  ).contractAddress!;
  await client.request({
    method: "anvil_setCode",
    params: [MULTISEND, await client.getCode({ address: multiSendAddress })],
  } as never);
  await installAssertionsCore(client);
  await installMockTarget(client);
  const singletonHash = await wallet.deployContract({
    account: owner,
    chain: null,
    abi: SafeArtifact.abi,
    bytecode: SafeArtifact.bytecode as Hex,
  });
  const singleton = (
    await client.waitForTransactionReceipt({ hash: singletonHash })
  ).contractAddress!;
  const proxyHash = await wallet.deployContract({
    account: owner,
    chain: null,
    abi: ProxyArtifact.abi,
    bytecode: ProxyArtifact.bytecode as Hex,
    args: [singleton],
  });
  safe = (await client.waitForTransactionReceipt({ hash: proxyHash }))
    .contractAddress!;
  const setup = await wallet.writeContract({
    account: owner,
    chain: null,
    address: safe,
    abi: SafeArtifact.abi,
    functionName: "setup",
    args: [
      [owner],
      1n,
      zeroAddress,
      "0x",
      zeroAddress,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  });
  await client.waitForTransactionReceipt({ hash: setup });
});
afterAll(() => process?.kill());

describe("authenticated Safe smart batches (isolated local chain)", () => {
  it("preserves the Safe caller and captures values after earlier writes", async () => {
    const action = await compile(
      `exec ${target} "setValue(uint256)" 73\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" @calc!($x + 1)\nexec ${target} "caller() returns (address)" -> [$caller]\nexec ${target} "setAddress(address)" $caller`,
    );
    expect((await submit(action)).status).toBe("success");
    expect(
      await client.readContract({
        address: target,
        abi: readAbi,
        functionName: "getValue",
      }),
    ).toBe(74n);
    expect(
      (
        await client.readContract({
          address: target,
          abi: readAbi,
          functionName: "getAddress",
        })
      ).toLowerCase(),
    ).toBe(safe.toLowerCase());
    expect(
      (
        (await client.readContract({
          address: safe,
          abi: SafeArtifact.abi,
          functionName: "getOwners",
        })) as Address[]
      ).map((address) => address.toLowerCase()),
    ).toEqual([owner.toLowerCase()]);
    expect(
      await client.readContract({
        address: safe,
        abi: SafeArtifact.abi,
        functionName: "getThreshold",
      }),
    ).toBe(1n);
  });
  it("rolls back earlier writes and output storage when a later call fails", async () => {
    const before = await client.readContract({
      address: target,
      abi: readAbi,
      functionName: "getValue",
    });
    const action = await compile(
      `exec ${target} "setValue(uint256)" 900\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "revertingFunction()"`,
    );
    expect((await submit(action)).status).toBe("reverted");
    expect(
      await client.readContract({
        address: target,
        abi: readAbi,
        functionName: "getValue",
      }),
    ).toBe(before);
  });
  it("rejects short returndata without reading old captured values", async () => {
    const salt = `--salt 0x${"55".repeat(32)}`;
    expect(
      (
        await submit(
          await compile(
            `exec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" $x`,
            salt,
          ),
        )
      ).status,
    ).toBe("success");
    const before = await client.readContract({
      address: target,
      abi: readAbi,
      functionName: "getValue",
    });
    const action = await compile(
      `exec ${target} "setValue(uint256) returns (uint256)" 999 -> [$x]\nexec ${target} "setValue(uint256)" $x`,
      salt,
    );
    expect((await submit(action)).status).toBe("reverted");
    expect(
      await client.readContract({
        address: target,
        abi: readAbi,
        functionName: "getValue",
      }),
    ).toBe(before);
  });
  it("interleaves exact native transfers and smart segments using MultiSend", async () => {
    await client.request({
      method: "anvil_setBalance",
      params: [safe, "0x100000"],
    } as never);
    const recipient = "0x1234567890123456789012345678901234567890";
    const before = await client.getBalance({ address: recipient });
    const tx = await compile(
      `exec ${target} "setValue(uint256)" 32\nsend ${recipient} --value 3\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" @calc!($x + 1)`,
    );
    expect(tx.executionPlan?.steps.length).toBe(4);
    expect((await submit(tx)).status).toBe("success");
    expect(await client.getBalance({ address: recipient })).toBe(before + 3n);
    expect(
      await client.readContract({
        address: target,
        abi: readAbi,
        functionName: "getValue",
      }),
    ).toBe(33n);
  });
  it("preserves reproducible smart calldata in unsigned Safe transactions", async () => {
    const build = async () => {
      const i = new Interpreter(tag.registry, {
        account: owner,
        chainId: 1,
        transports: { 1: transport },
      });
      await i.interpret(
        `load safe\nsafe:propose-offline $tx ${safe} --salt 0x${"77".repeat(32)} !(\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" $x\n)`,
      );
      return i.getBinding("$tx", BindingsSpace.USER);
    };
    expect(await build()).toEqual(await build());
  });
  it("verifies the same smart payload as prepared Safe transaction JSON with explicit salt and nonce", async () => {
    const body = `!(\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" $x\n)`;
    const options = `--nonce 7 --salt 0x${"88".repeat(32)}`;
    const build = new Interpreter(tag.registry, {
      account: owner,
      chainId: 1,
      transports: { 1: transport },
    });
    await build.interpret(
      `load safe\nsafe:propose-offline $tx ${safe} ${options} ${body}`,
    );
    const signable = build.getBinding("$tx", BindingsSpace.USER) as string;
    // Blocks are prepared first: the report helper takes Safe transaction JSON.
    const review = async (input: string, opts: string, reviewOpts = "") => {
      const interpreter = new Interpreter(tag.registry, {
        account: owner,
        chainId: 1,
        transports: { 1: transport },
      });
      const script = input.startsWith("!(")
        ? `safe:propose-offline $tx ${safe} ${opts} ${input}\nset $review @safe:verify(${safe} $tx${reviewOpts})`
        : `set $review @safe:verify(${safe} ${input}${reviewOpts})`;
      expect(await interpreter.interpret(`load safe\n${script}`)).toEqual([]);
      return JSON.parse(
        interpreter.getBinding("$review", BindingsSpace.USER) as string,
      );
    };
    const fromBlock = await review(body, options);
    const fromJson = await review(JSON.stringify(signable), "");
    expect(fromBlock.hashes.safeTxHash).toBe(fromJson.hashes.safeTxHash);
    expect((await review(body, options)).hashes.safeTxHash).toBe(
      fromBlock.hashes.safeTxHash,
    );
    expect(
      (await review(JSON.stringify(signable), "", " no-rpc:true")).hashes
        .safeTxHash,
    ).toBe(fromBlock.hashes.safeTxHash);
  });

  it("prepares smart payloads with automatic salt and nonce defaults", async () => {
    const review = async () => {
      const interpreter = new Interpreter(tag.registry, {
        account: owner,
        chainId: 1,
        transports: { 1: transport },
      });
      expect(
        await interpreter.interpret(
          `load safe\nsafe:propose-offline $tx ${safe} !(\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint256)" $x\n)\nset $review @safe:verify(${safe} $tx)`,
        ),
      ).toEqual([]);
      return JSON.parse(
        interpreter.getBinding("$review", BindingsSpace.USER) as string,
      );
    };
    const first = await review();
    const second = await review();
    expect(first.hashes.safeTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(first.hashes.safeTxHash).not.toBe(second.hashes.safeTxHash);
  });

  it("rejects salt outside smart blocks", async () => {
    const interpret = (script: string) =>
      new Interpreter(tag.registry, {
        account: owner,
        chainId: 1,
        transports: { 1: transport },
      }).interpret(`load safe\n${script}`);
    const salt = `--salt 0x${"99".repeat(32)}`;
    for (const command of ["propose", "propose-offline $tx", "execute"]) {
      await expect(
        interpret(
          `safe:${command} ${safe} ${salt} (\nexec ${target} "setValue(uint256)" 1\n)`,
        ),
      ).rejects.toThrow("--salt requires a smart block");
      if (command !== "execute")
        await expect(
          interpret(`safe:${command} ${safe} "a text message" ${salt}`),
        ).rejects.toThrow("--salt requires a smart block");
    }
  });

  it("guards runtime integer narrowing before submitting the protocol call", async () => {
    const action = await compile(
      `exec ${target} "setValue(uint256)" 256\nexec ${target} "getValue() returns (uint256)" -> [$x]\nexec ${target} "setValue(uint8)" $x`,
    );
    expect((await submit(action)).status).toBe("reverted");
  });
});
