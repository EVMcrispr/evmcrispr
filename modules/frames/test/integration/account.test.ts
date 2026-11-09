import "../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { getPublicClient, getWalletClients } from "@evmcrispr/test-utils";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  type Hex,
  hashMessage,
  parseEther,
  parseEventLogs,
  toHex,
} from "viem";
import { signMessage } from "viem/experimental/erc7739";
import { compileFrameContract } from "../../scripts/compile";
import {
  DETERMINISTIC_DEPLOYER,
  deploymentTransactions,
  FACTORY_ADDRESS,
  predictAccountAddress,
} from "../../src/addresses";
import {
  frameAccountAbi,
  frameAccountFactoryAbi,
} from "../../src/contracts/artifacts";

const client = getPublicClient();
const [deployer, second] = getWalletClients();
const OWNER = deployer!.account.address;
const OTHER = second!.account.address;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const BEEF = "0x000000000000000000000000000000000000bEEF";
const SINGLE = `0x${"00".repeat(32)}` as Hex;
const BATCH = `0x01${"00".repeat(31)}` as Hex;
const DELEGATECALL = `0xff${"00".repeat(31)}` as Hex;

/** An ERC-7579 executor module that forwards one execution to an account. */
const EXECUTOR = compileFrameContract(
  "ProbeExecutor",
  `// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
interface IAccount { function executeFromExecutor(bytes32, bytes calldata) external payable returns (bytes[] memory); }
contract ProbeExecutor {
  function onInstall(bytes calldata) external {}
  function onUninstall(bytes calldata) external {}
  function isModuleType(uint256 t) external pure returns (bool) { return t == 2; }
  function run(address account, bytes32 mode, bytes calldata data) external {
    IAccount(account).executeFromExecutor(mode, data);
  }
}
`,
);

const anvil = (method: string, params: unknown[]) =>
  client.request({ method: method as never, params: params as never });

async function send(to: Address, data: Hex, value = 0n) {
  const hash = await deployer!.sendTransaction({
    to,
    data,
    value,
    chain: client.chain,
  });
  return client.waitForTransactionReceipt({ hash });
}

/** A call from `from` without its key (anvil impersonation). */
async function sendAs(from: Address, to: Address, data: Hex) {
  await anvil("anvil_impersonateAccount", [from]);
  await anvil("anvil_setBalance", [from, toHex(parseEther("1"))]);
  try {
    const hash = (await anvil("eth_sendTransaction", [
      { from, to, data, gas: toHex(1_000_000) },
    ])) as Hex;
    return await client.waitForTransactionReceipt({ hash });
  } finally {
    await anvil("anvil_stopImpersonatingAccount", [from]);
  }
}

async function createAccount(owner: Address, salt: bigint) {
  return send(
    FACTORY_ADDRESS,
    encodeFunctionData({
      abi: frameAccountFactoryAbi,
      functionName: "createAccount",
      args: [owner, salt],
    }),
  );
}

const read = <F extends string>(
  address: Address,
  functionName: F,
  args: unknown[] = [],
) =>
  client.readContract({
    address,
    abi: frameAccountAbi,
    functionName: functionName as never,
    args: args as never,
  }) as Promise<unknown>;

beforeAll(async () => {
  expect(await client.getCode({ address: DETERMINISTIC_DEPLOYER })).not.toBe(
    undefined,
  );
  for (const tx of deploymentTransactions()) await send(tx.to, tx.data);
  expect(await client.getCode({ address: FACTORY_ADDRESS })).toMatch(/^0x.+/);
}, 120_000);

describe("frame account", () => {
  it("predicts the address the factory deploys to", async () => {
    for (const owner of [OWNER, OTHER])
      for (const salt of [0n, 1n, 2n ** 255n]) {
        const onChain = await client.readContract({
          address: FACTORY_ADDRESS,
          abi: frameAccountFactoryAbi,
          functionName: "getAddress",
          args: [owner, salt],
        });
        expect(predictAccountAddress(owner, salt)).toBe(onChain);
      }
  });

  it("creates an account once, carrying its owner", async () => {
    const first = await createAccount(OWNER, 0n);
    const second = await createAccount(OWNER, 0n);
    const created = [first, second].flatMap((r) =>
      parseEventLogs({
        abi: frameAccountFactoryAbi,
        eventName: "AccountCreated",
        logs: r.logs,
      }),
    );
    expect(created).toHaveLength(1);
    const account = predictAccountAddress(OWNER, 0n);
    expect(created[0]!.args.account).toBe(account);
    expect(await read(account, "owner")).toBe(OWNER);
    expect(await read(account, "accountId")).toBe(
      "evmcrispr.frame-account.2.0.0",
    );
  });

  it("executes a batch from itself only", async () => {
    await createAccount(OWNER, 1n);
    const account = predictAccountAddress(OWNER, 1n);
    await send(account, "0x", parseEther("1"));
    const batch = encodeAbiParameters(
      [
        {
          type: "tuple[]",
          components: [
            { name: "target", type: "address" },
            { name: "value", type: "uint256" },
            { name: "callData", type: "bytes" },
          ],
        },
      ],
      [
        [
          { target: DEAD, value: 3n, callData: "0x" },
          { target: BEEF, value: 5n, callData: "0x" },
        ],
      ],
    );
    const execute = (mode: Hex, data: Hex) =>
      encodeFunctionData({
        abi: frameAccountAbi,
        functionName: "execute",
        args: [mode, data],
      });
    const [dead, beef] = await Promise.all([
      client.getBalance({ address: DEAD }),
      client.getBalance({ address: BEEF }),
    ]);
    expect((await sendAs(account, account, execute(BATCH, batch))).status).toBe(
      "success",
    );
    expect(await client.getBalance({ address: DEAD })).toBe(dead + 3n);
    expect(await client.getBalance({ address: BEEF })).toBe(beef + 5n);
    expect((await sendAs(OTHER, account, execute(BATCH, batch))).status).toBe(
      "reverted",
    );
    const single = encodePacked(
      ["address", "uint256", "bytes"],
      [DEAD, 1n, "0x"],
    );
    expect(
      (await sendAs(account, account, execute(DELEGATECALL, single))).status,
    ).toBe("reverted");
    expect(await read(account, "supportsExecutionMode", [DELEGATECALL])).toBe(
      false,
    );
    expect(await read(account, "supportsExecutionMode", [SINGLE])).toBe(true);
  });

  it("installs executors only, and lets them execute", async () => {
    await createAccount(OWNER, 2n);
    const account = predictAccountAddress(OWNER, 2n);
    await send(account, "0x", parseEther("1"));
    const deployed = await deployer!.deployContract({
      abi: EXECUTOR.abi,
      bytecode: EXECUTOR.bytecode,
      chain: client.chain,
    });
    const executor = (
      await client.waitForTransactionReceipt({ hash: deployed })
    ).contractAddress!;
    const install = (type: bigint) =>
      encodeFunctionData({
        abi: frameAccountAbi,
        functionName: "installModule",
        args: [type, executor, "0x"],
      });
    expect((await sendAs(account, account, install(2n))).status).toBe(
      "success",
    );
    expect(await read(account, "isModuleInstalled", [2n, executor, "0x"])).toBe(
      true,
    );
    expect((await sendAs(account, account, install(1n))).status).toBe(
      "reverted",
    );
    expect((await sendAs(OTHER, account, install(2n))).status).toBe("reverted");
    const single = encodePacked(
      ["address", "uint256", "bytes"],
      [DEAD, 2n, "0x"],
    );
    const before = await client.getBalance({ address: DEAD });
    const run = encodeFunctionData({
      abi: EXECUTOR.abi,
      functionName: "run" as never,
      args: [account, SINGLE, single] as never,
    });
    expect((await send(executor, run)).status).toBe("success");
    expect(await client.getBalance({ address: DEAD })).toBe(before + 2n);
    const direct = encodeFunctionData({
      abi: frameAccountAbi,
      functionName: "executeFromExecutor",
      args: [SINGLE, single],
    });
    expect((await sendAs(OTHER, account, direct)).status).toBe("reverted");
  });

  it("accepts its owner's ERC-7739 signature for itself only", async () => {
    await createAccount(OWNER, 3n);
    await createAccount(OWNER, 4n);
    const a = predictAccountAddress(OWNER, 3n);
    const b = predictAccountAddress(OWNER, 4n);
    const message = "frame account";
    const signature = await signMessage(deployer!, {
      account: deployer!.account,
      message,
      verifier: a,
    });
    const hash = hashMessage(message);
    expect(await read(a, "isValidSignature", [hash, signature])).toBe(
      "0x1626ba7e",
    );
    expect(await read(b, "isValidSignature", [hash, signature])).toBe(
      "0xffffffff",
    );
    // The same signature with s → n − s (high s) and v flipped.
    const n =
      0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const r = signature.slice(0, 66);
    const s = BigInt(`0x${signature.slice(66, 130)}`);
    const v = Number.parseInt(signature.slice(130, 132), 16);
    const high =
      `${r}${(n - s).toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}` as Hex;
    expect(await read(a, "isValidSignature", [hash, high])).toBe("0xffffffff");
  });
});
