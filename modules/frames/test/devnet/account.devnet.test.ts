// Live, opt-in (EVMCRISPR_FRAME_DEVNET=1): a frame account on the mining
// devnet (`bun scripts/frame-devnet.ts up mining`), created through the
// factory and sending one frame transaction through the canonical mempool.
import { describe, expect, it } from "bun:test";
import {
  arbitrarySignatureEntry,
  type FrameTransactionReceipt,
  simulate,
  toFrameRequests,
} from "@evmcrispr/viem-frames";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, newTx, sigHash } from "@forshtat/hegota-support/tx";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  type Hex,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { estimateFeesPerGas, getTransactionCount } from "viem/actions";
import { devAccounts } from "../../../../scripts/frame-devnet-config";
import {
  frameAccountTypedData,
  sendAccountFrameTransaction,
} from "../../src/account";
import {
  deploymentTransactions,
  FACTORY_ADDRESS,
  predictAccountAddress,
} from "../../src/addresses";
import { chains } from "../../src/chains";
import { frameAccountFactoryAbi } from "../../src/contracts/artifacts";
import {
  ACCOUNT_CHECK_GAS,
  layoutFrames,
  requireLimits,
} from "../../src/layout";

const ENABLED = process.env.EVMCRISPR_FRAME_DEVNET === "1";
const declared = chains.find((c) => c.key === "framesMining")!;
const chain = defineChain({
  id: declared.id,
  name: declared.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [declared.rpcUrl] } },
});
const DEAD = "0x000000000000000000000000000000000000dEaD";

describe.skipIf(!ENABLED)("frame account on the mining devnet", () => {
  it("is created through the factory and sends a frame transaction its owner signed", async () => {
    const client = createPublicClient({ chain, transport: http() });
    expect(await client.getChainId()).toBe(declared.id);
    const owner = privateKeyToAccount(devAccounts()[0]!.privateKey);
    const wallet = createWalletClient({
      account: owner,
      chain,
      transport: http(),
    });
    const sendAndWait = async (to: `0x${string}`, data: Hex, value = 0n) => {
      const hash = await wallet.sendTransaction({ to, data, value });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
    };

    // 1. The factory once, then a fresh account, funded.
    if (!(await client.getCode({ address: FACTORY_ADDRESS })))
      for (const tx of deploymentTransactions())
        await sendAndWait(tx.to, tx.data);
    const salt = BigInt(Date.now());
    await sendAndWait(
      FACTORY_ADDRESS,
      encodeFunctionData({
        abi: frameAccountFactoryAbi,
        functionName: "createAccount",
        args: [owner.address, salt],
      }),
    );
    const account = predictAccountAddress(owner.address, salt);
    expect(await client.getCode({ address: account })).toMatch(/^0x.+/);
    await sendAndWait(account, "0x", parseEther("1"));

    // 2. The frames `frames:tx --account` lays out for one transfer.
    const frames = layoutFrames({
      actions: [{ to: DEAD, value: 1n, data: "0x", gas: 50_000n }],
      sender: account,
      chainId: chain.id,
      stateGas: 200_000n,
      accountChecks: true,
    });
    requireLimits(frames);

    // 3. Checkpoint: the transaction as it will be sent, signed, simulated.
    const fees = await estimateFeesPerGas(client);
    const unsigned = newTx({
      chainId: BigInt(chain.id),
      sender: account,
      nonceSeq: BigInt(
        await getTransactionCount(client, {
          address: account,
          blockTag: "pending",
        }),
      ),
      frames: toFrameRequests(frames, profile) as never,
      signatures: [arbitrarySignatureEntry("0x", profile)],
      fees: {
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      },
    });
    const signature = await owner.signTypedData(
      frameAccountTypedData(account, sigHash(profile, unsigned), chain.id),
    );
    const raw = encodeTx(profile, {
      ...unsigned,
      signatures: [arbitrarySignatureEntry(signature, profile)],
    });
    const result = (await simulate(declared.rpcUrl, raw)) as {
      executionStatus?: string;
      canonicalMempoolValid?: boolean;
      canonicalMempoolViolation?: unknown;
      frames?: { gasUsed: Hex; succeeded: boolean }[];
    };
    console.log("simulation:", JSON.stringify(result));
    expect(result.executionStatus).toBe("success");
    expect(result.canonicalMempoolValid).toBe(true);
    expect(BigInt(result.frames![0]!.gasUsed)).toBeLessThan(ACCOUNT_CHECK_GAS);

    // 4. Sent, through the canonical mempool, and mined.
    const before = await client.getBalance({ address: DEAD });
    const { receipt } = await sendAccountFrameTransaction({
      wallet,
      account,
      owner: owner.address,
      frames,
      mempool: "canonical",
      chain,
      transport: http(declared.rpcUrl),
      onLog: (line, level) => console.log(`[${level}] ${line}`),
    });
    const mined = receipt as FrameTransactionReceipt;
    expect(mined.status).toBe("success");
    expect(mined.payer?.toLowerCase()).toBe(account.toLowerCase());
    expect(mined.frameReceipts?.every((f) => f.status === "success")).toBe(
      true,
    );
    expect(await client.getBalance({ address: DEAD })).toBe(before + 1n);
  }, 240_000);
});
