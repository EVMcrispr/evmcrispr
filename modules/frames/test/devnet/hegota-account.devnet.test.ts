// Live, opt-in (EVMCRISPR_HEGOTA=1): a frame account on the public Hegota
// devnet, the build made for it (FrameAccountHegota: SIGDATACOPY at 0xba).
// The implementation and the factory are deployed once through the
// deterministic deployer, an account for anvil's public key #0 is created
// and funded (the owner agreed to test sends from it), then one
// `frames:tx --account` with a post-verify check is simulated on both
// backends and sent: the account's own verify frame checks the owner's
// signature on the chain.
import "../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import type { ModuleActionSendCtx } from "@evmcrispr/sdk";
import { getTransports } from "@evmcrispr/test-utils";
import {
  createInterpreter,
  evml,
  Interpreter,
} from "@evmcrispr/test-utils/evml";
import { HEGOTA_DEVNET_RPC, hegotaDevnet } from "@evmcrispr/viem-frames";
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { frameAction } from "../../src/actions";
import { accountContracts } from "../../src/addresses";
import { frameAccountFactoryAbi } from "../../src/contracts/artifacts";
import type { FrameModuleAction } from "../../src/frame-action";

const ENABLED = process.env.EVMCRISPR_HEGOTA === "1";
const HEGOTA = hegotaDevnet.id;
const OWNER = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const DEAD = "0x000000000000000000000000000000000000dEaD";
const SALT = 0x8141n;
const contracts = accountContracts(HEGOTA);
const ACCOUNT = contracts.predictAccountAddress(OWNER.address, SALT);

const transport = http(HEGOTA_DEVNET_RPC);
const reader = createPublicClient({ chain: hegotaDevnet, transport });
const wallet = createWalletClient({
  account: OWNER,
  chain: hegotaDevnet,
  transport,
});

/** Sends, with the node's own gas estimate (EIP-8037 prices code deposit as
 *  state gas: fixed limits are a guess), and waits for success. */
async function sendAndWait(to: Hex, data: Hex, value = 0n) {
  const gas = await reader.estimateGas({
    account: OWNER.address,
    to,
    data,
    value,
  });
  const hash = await wallet.sendTransaction({
    to,
    data,
    value,
    gas: (gas * 6n) / 5n,
  });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${hash} reverted`);
}

const hasCode = async (address: Hex) =>
  ((await reader.getCode({ address })) ?? "0x") !== "0x";

const script = (check: string) =>
  [
    `tx --account ${ACCOUNT} --gas 300000 (`,
    `  send ${DEAD} --value 1 --gas 50000`,
    "  post-verify (",
    `    ${check}`,
    "  )",
    ")",
  ].join("\n");

describe.skipIf(!ENABLED)("a frame account on the Hegota devnet", () => {
  beforeAll(async () => {
    const [implementation, factory] = contracts.deploymentTransactions();
    if (!(await hasCode(contracts.implementation)))
      await sendAndWait(implementation!.to, implementation!.data);
    if (!(await hasCode(contracts.factory)))
      await sendAndWait(factory!.to, factory!.data);
    if (!(await hasCode(ACCOUNT)))
      await sendAndWait(
        contracts.factory,
        encodeFunctionData({
          abi: frameAccountFactoryAbi,
          functionName: "createAccount",
          args: [OWNER.address, SALT],
        }),
      );
    if ((await reader.getBalance({ address: ACCOUNT })) < parseEther("0.01"))
      await sendAndWait(ACCOUNT, "0x", parseEther("0.02"));
  }, 600_000);

  it("is the Hegota build, deployed there", async () => {
    expect(await hasCode(contracts.implementation)).toBe(true);
    expect(await hasCode(ACCOUNT)).toBe(true);
  });

  for (const using of ["ethereumjs", "revm"])
    it(`sends from the account in the fork (${using})`, async () => {
      await createInterpreter(
        [
          "load sim",
          "load frames [tx post-verify]",
          `sim:fork --using ${using} --on hegotaDevnet --as ${OWNER.address} (`,
          ...script(`assert @balance!(ETH ${DEAD}) >= 1`).split("\n"),
          ")",
        ].join("\n"),
        reader as never,
        { chainId: HEGOTA },
      ).interpret();
    }, 300_000);

  it("sends from the account on the chain, paid by a sponsor built for Hegota", async () => {
    const initCode = concatHex([
      contracts.sponsorBytecode,
      encodeAbiParameters(
        [{ type: "address" }, { type: "address" }],
        [OWNER.address, ACCOUNT],
      ),
    ]);
    const gas = await reader.estimateGas({
      account: OWNER.address,
      data: initCode,
      value: parseEther("0.01"),
    });
    const hash = await wallet.sendTransaction({
      data: initCode,
      value: parseEther("0.01"),
      gas: (gas * 6n) / 5n,
    });
    const sponsor = (await reader.waitForTransactionReceipt({ hash }))
      .contractAddress!;
    const interpreter = new Interpreter(evml.registry, {
      account: OWNER.address,
      chainId: HEGOTA,
      transports: getTransports(),
    });
    const [action] = (await interpreter.interpret(
      [
        "load frames [tx]",
        `tx --account ${ACCOUNT} --paymaster ${sponsor} --gas 300000 (`,
        `  send ${DEAD} --value 1 --gas 50000`,
        ")",
      ].join("\n"),
    )) as FrameModuleAction[];
    const accountBefore = await reader.getBalance({ address: ACCOUNT });
    const sponsorBefore = await reader.getBalance({ address: sponsor });
    await frameAction.send(action!, {
      walletClient: wallet,
      getPublicClient: () => reader,
      transports: { [HEGOTA]: transport },
      onLog: () => {},
    } as unknown as ModuleActionSendCtx);
    // The account paid only the wei it sent; the sponsor paid the gas.
    expect(await reader.getBalance({ address: ACCOUNT })).toBe(
      accountBefore - 1n,
    );
    expect(await reader.getBalance({ address: sponsor })).toBeLessThan(
      sponsorBefore,
    );
  }, 300_000);

  it("sends from the account on the chain: its verify frame checks the owner's signature (SIGDATACOPY at 0xba)", async () => {
    const interpreter = new Interpreter(evml.registry, {
      account: OWNER.address,
      chainId: HEGOTA,
      transports: getTransports(),
    });
    const [action] = (await interpreter.interpret(
      `load frames [tx post-verify]\n${script(`assert @balance!(ETH ${DEAD}) >= 1`)}`,
    )) as FrameModuleAction[];
    const before = await reader.getBalance({ address: DEAD });
    await frameAction.send(action!, {
      walletClient: wallet,
      getPublicClient: () => reader,
      transports: { [HEGOTA]: transport },
      onLog: () => {},
    } as unknown as ModuleActionSendCtx);
    expect(await reader.getBalance({ address: DEAD })).toBe(before + 1n);
  }, 300_000);
});
