/**
 * Frame accounts on the public alt-mempool devnet (chain 1337). Skipped
 * unless EVMCRISPR_FRAME_DEVNET=1: it needs the network, and the devnet can
 * be reset or stall at any time. Each run uses throwaway keys funded by the
 * devnet faucet.
 *
 * 1. The spec's demo script, run by the CLI with a local key: admission is
 *    asserted; mining is a soft check (logged), and a receipt, if it arrives,
 *    must name the sponsor as payer.
 * 2. The contracts' security properties, pinned with
 *    `ethrex_simulateFrameTransaction` on the node (nothing is submitted):
 *    a wrong signer is invalid, a sponsor pays only for its account, an
 *    account cannot have a zero owner.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALT_MEMPOOL_NODE,
  altMempoolActions,
  altMempoolDevnet,
  arbitrarySignatureEntry,
  call,
  frameAccountTypedData,
  frameProfileOf,
  onlyVerify,
  pay,
  selfVerify,
  sidecarGasPrice,
  simulate,
} from "@evmcrispr/viem-frames";
import { encodeTx, newTx, sigHash } from "@forshtat/hegota-support/tx";
import {
  type Address,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  type Hex,
  http,
  parseEther,
  publicActions,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  frameAccountAbi,
  frameAccountBytecode,
  frameSponsorAbi,
  frameSponsorBytecode,
} from "../../../modules/frame/src/contracts/artifacts";

const BIN = join(import.meta.dirname, "../src/bin.ts");
const GATEWAY = "https://altmempoolgateway.forshtat.com/rpc";
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const run =
  process.env.EVMCRISPR_FRAME_DEVNET === "1" ? describe : describe.skip;

const profile = frameProfileOf(altMempoolDevnet);

// The spec's demo script, with the two addresses printed.
const DEMO = `load frame [tx new-account new-sponsor]
switch 1337

new-account $account --owner @me
send $account --value 0.001e18
new-sponsor $sponsor --for $account --fund 0.05e18
print "account $account"
print "sponsor $sponsor"

tx --account $account --paymaster $sponsor --state-gas 200000 (
  send ${RECIPIENT} --value 1e9 --gas 50000
)
`;

function funded() {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const client = createWalletClient({
    account,
    chain: altMempoolDevnet,
    transport: http(undefined, { retryCount: 5 }),
  })
    .extend(publicActions)
    .extend(altMempoolActions());
  return { key, account, client };
}

async function fund(client: ReturnType<typeof funded>["client"]) {
  const address = client.account.address;
  await client.requestFaucet(address);
  for (let i = 0; (await client.getBalance({ address })) === 0n; i++) {
    if (i > 60) throw new Error("the faucet's transfer never arrived");
    await Bun.sleep(2_000);
  }
}

run("frame accounts on the alt-mempool devnet", () => {
  test("the demo script is admitted, and paid by the sponsor once mined", async () => {
    const { key, client } = funded();
    await fund(client);

    const dir = mkdtempSync(join(tmpdir(), "evmcrispr-frame-account-"));
    try {
      const file = join(dir, "demo.evml");
      writeFileSync(file, DEMO);
      const proc = Bun.spawn(
        ["bun", BIN, "run", file, "--yes", "--experimental"],
        {
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            NO_COLOR: "1",
            EVMCRISPR_PRIVATE_KEY: key,
            EVMCRISPR_DEFAULT_CHAIN_ID: "1337",
            EVMCRISPR_RPC_URL_1337: GATEWAY,
          } as Record<string, string>,
        },
      );
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      const output = `${stdout}\n${stderr}`;
      console.log(output);
      expect(output).not.toContain(key);

      const admitted = output.match(
        /Frame transaction (0x[0-9a-f]{64}) from account (0x[0-9a-fA-F]{40}) admitted/,
      );
      expect(admitted).not.toBeNull();
      const sponsor = output.match(/sponsor (0x[0-9a-fA-F]{40})/)?.[1];
      expect(sponsor).toBeDefined();
      console.log(`admitted: ${admitted?.[1]} from account ${admitted?.[2]}`);

      const mined = output.match(
        /Frame transaction 0x[0-9a-f]{64} mined in block (\d+), paid by (0x[0-9a-fA-F]{40})/,
      );
      if (mined) {
        console.log(`mined in block ${mined[1]}, payer ${mined[2]}`);
        expect(mined[2]?.toLowerCase()).toBe(sponsor?.toLowerCase());
      } else {
        // The devnet can stall: admission is the assertion, mining a soft check.
        console.log("not mined within the wait (soft check, not a failure)");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 420_000);

  describe("security properties, by simulation", () => {
    const SCOPE_BOTH = 3;
    const SCOPE_EXECUTION = 2;

    async function deploy(
      client: ReturnType<typeof funded>["client"],
      abi: readonly unknown[],
      bytecode: Hex,
      args: unknown[],
      value = 0n,
    ) {
      const hash = await client.sendTransaction({
        type: "legacy",
        data: encodeDeployData({ abi, bytecode, args } as never),
        value,
        gas: 6_000_000n,
        gasPrice: 2_000_000n,
      } as never);
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });
      return { receipt, address: receipt.contractAddress as Address };
    }

    async function topUp(
      client: ReturnType<typeof funded>["client"],
      to: Address,
      value: bigint,
    ) {
      const hash = await client.sendTransaction({
        type: "legacy",
        to,
        value,
        gas: 100_000n,
        gasPrice: 2_000_000n,
      } as never);
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });
      expect(receipt.status).toBe("success");
    }

    function verifyData(scope: number) {
      return encodeFunctionData({
        abi: frameAccountAbi,
        functionName: "verify",
        args: [scope],
      });
    }

    /** A simulated transaction from `account`, authorized by `signer`'s typed-data signature. */
    async function simulated({
      account,
      signer,
      frames,
    }: {
      account: Address;
      signer: ReturnType<typeof privateKeyToAccount>;
      frames: ReturnType<typeof selfVerify>[];
    }) {
      const reader = funded().client;
      const fees = await sidecarGasPrice(reader);
      // A contract account's nonce starts at its deployment's, not at zero.
      const nonce = await reader.getTransactionCount({
        address: account,
        blockTag: "pending",
      });
      const unsigned = newTx({
        chainId: altMempoolDevnet.id,
        sender: account,
        nonceSeq: BigInt(nonce),
        frames: frames as never,
        signatures: [arbitrarySignatureEntry("0x", profile)],
        fees,
      });
      const signature = await signer.signTypedData(
        frameAccountTypedData(account, sigHash(profile, unsigned)),
      );
      const raw = encodeTx(profile, {
        ...unsigned,
        signatures: [arbitrarySignatureEntry(signature, profile)],
      }) as Hex;
      return simulate(ALT_MEMPOOL_NODE, raw).then(
        (result) => ({ result }),
        (error: unknown) => ({ error: String(error) }),
      );
    }

    const body = call({
      to: RECIPIENT,
      value: 0n,
      gas: 50_000n,
      stateGas: 200_000n,
    });

    test("a transaction signed by a key that is not the owner is invalid", async () => {
      const deployer = funded();
      await fund(deployer.client);
      const owner = privateKeyToAccount(generatePrivateKey());
      const stranger = privateKeyToAccount(generatePrivateKey());
      const { address, receipt } = await deploy(
        deployer.client,
        frameAccountAbi,
        frameAccountBytecode as Hex,
        [owner.address],
      );
      expect(receipt.status).toBe("success");
      await topUp(deployer.client, address, parseEther("0.01"));
      const frames = [
        selfVerify({ gas: 40_000n, data: verifyData(SCOPE_BOTH) }),
        body,
      ];

      const good = await simulated({ account: address, signer: owner, frames });
      console.log(
        "owner-signed simulation:",
        JSON.stringify(good).slice(0, 900),
      );
      expect(good).toHaveProperty("result");
      expect(
        (good as { result: { executionStatus?: string } }).result
          .executionStatus,
      ).toBe("success");

      const bad = await simulated({
        account: address,
        signer: stranger,
        frames,
      });
      console.log(
        "stranger-signed simulation:",
        JSON.stringify(bad).slice(0, 400),
      );
      expect(bad).toHaveProperty("result");
      const refusal = (bad as { result: Record<string, unknown> }).result;
      expect(refusal.executionStatus).toBeNull();
      expect(refusal.canonicalMempoolViolation).toBe(
        "validation prefix frame reverted",
      );
      expect(refusal.failedFrameIndex).toBe(0);
    }, 300_000);

    test("a sponsor refuses to pay for an account other than its own", async () => {
      const deployer = funded();
      await fund(deployer.client);
      const owner = privateKeyToAccount(generatePrivateKey());
      const sponsored = await deploy(
        deployer.client,
        frameAccountAbi,
        frameAccountBytecode as Hex,
        [owner.address],
      );
      const other = await deploy(
        deployer.client,
        frameAccountAbi,
        frameAccountBytecode as Hex,
        [owner.address],
      );
      const sponsor = await deploy(
        deployer.client,
        frameSponsorAbi,
        frameSponsorBytecode as Hex,
        [owner.address, sponsored.address],
        parseEther("0.05"),
      );
      expect(sponsored.receipt.status).toBe("success");
      expect(other.receipt.status).toBe("success");
      expect(sponsor.receipt.status).toBe("success");
      const sponsorVerify = encodeFunctionData({
        abi: frameSponsorAbi,
        functionName: "verify",
      });
      const framesFor = () => [
        onlyVerify({ gas: 40_000n, data: verifyData(SCOPE_EXECUTION) }),
        pay(sponsor.address, { gas: 50_000n, data: sponsorVerify }),
        body,
      ];

      const good = await simulated({
        account: sponsored.address,
        signer: owner,
        frames: framesFor(),
      });
      console.log(
        "sponsored account simulation:",
        JSON.stringify(good).slice(0, 900),
      );
      expect(good).toHaveProperty("result");
      expect(
        (good as { result: { executionStatus?: string } }).result
          .executionStatus,
      ).toBe("success");

      const bad = await simulated({
        account: other.address,
        signer: owner,
        frames: framesFor(),
      });
      console.log(
        "other account simulation:",
        JSON.stringify(bad).slice(0, 400),
      );
      expect(bad).toHaveProperty("result");
      const refusal = (bad as { result: Record<string, unknown> }).result;
      expect(refusal.executionStatus).toBeNull();
      expect(refusal.canonicalMempoolViolation).toBe(
        "validation prefix frame reverted",
      );
      expect(refusal.failedFrameIndex).toBe(1);
    }, 300_000);

    test("a frame account with a zero owner cannot be deployed", async () => {
      const deployer = funded();
      await fund(deployer.client);
      const { receipt } = await deploy(
        deployer.client,
        frameAccountAbi,
        frameAccountBytecode as Hex,
        ["0x0000000000000000000000000000000000000000"],
      );
      console.log("zero-owner deployment receipt status:", receipt.status);
      expect(receipt.status).toBe("reverted");
    }, 300_000);
  });
});
