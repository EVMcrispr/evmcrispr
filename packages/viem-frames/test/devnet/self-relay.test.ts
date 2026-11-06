/**
 * Sends a real frame transaction through the public alt mempool (chain 1337).
 * Skipped unless VIEM_FRAMES_DEVNET=1: it needs the network, and the devnet
 * can be reset at any time. Each run uses a throwaway key funded by the
 * devnet faucet.
 *
 * Waiting for the transaction to be mined is a separate opt-in
 * (VIEM_FRAMES_DEVNET_MINED=1): on 2026-11-06 the sidecar admitted frame
 * transactions but none were being bundled, ours or anyone else's.
 */
import { describe, expect, test } from "bun:test";
import { createWalletClient, http, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  altMempoolActions,
  altMempoolDevnet,
  call,
  selfVerify,
} from "../../src";

const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const run = process.env.VIEM_FRAMES_DEVNET === "1" ? describe : describe.skip;
const mined = process.env.VIEM_FRAMES_DEVNET_MINED === "1" ? test : test.skip;
const ADMITTED = ["New", "Pending", "Submitted", "OnChain", "Finalized"];

run("alt-mempool devnet", () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const client = createWalletClient({
    account,
    chain: altMempoolDevnet,
    transport: http(undefined, { retryCount: 5 }),
  })
    .extend(publicActions)
    .extend(altMempoolActions());
  let hash: `0x${string}` | undefined;

  test("a self-relayed transfer, its gas estimated, is admitted by the alt mempool", async () => {
    await client.requestFaucet(account.address);
    for (
      let i = 0;
      (await client.getBalance({ address: account.address })) === 0n;
      i++
    ) {
      if (i > 60) throw new Error("the faucet's transfer never arrived");
      await Bun.sleep(2_000);
    }

    // A throwaway key: signing the provisional transaction risks nothing.
    hash = await client.sendFrameTransaction({
      frames: [selfVerify(), call({ to: RECIPIENT, value: 1_000_000_000n })],
      sizeBySimulation: true,
    });
    console.log(
      `admitted: ${hash} (${altMempoolDevnet.blockExplorers?.default.url}, search the hash)`,
    );

    const status = await client.getFrameTransactionStatus(hash);
    expect(ADMITTED).toContain(status.status);
    expect(status.sender.toLowerCase()).toBe(account.address.toLowerCase());
    expect(status.payer.toLowerCase()).toBe(account.address.toLowerCase());
  }, 180_000);

  mined(
    "and is mined, paid by its sender, with every frame succeeding",
    async () => {
      if (!hash) throw new Error("the admission test did not run");
      const receipt = (await client.waitForTransactionReceipt({
        hash,
        timeout: 300_000,
      })) as any;
      expect(receipt.status).toBe("success");
      expect(receipt.payer.toLowerCase()).toBe(account.address.toLowerCase());
      expect(receipt.frameReceipts.map((f: any) => f.status)).toEqual([
        "success",
        "success",
      ]);
    },
    320_000,
  );
});
