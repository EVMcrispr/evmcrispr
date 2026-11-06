/**
 * Runs a script with `frame:tx` through the CLI against the public alt-mempool
 * devnet (chain 1337). Skipped unless EVMCRISPR_FRAME_DEVNET=1: it needs the
 * network, and the devnet can be reset at any time. Each run uses a throwaway
 * key funded by the devnet faucet.
 *
 * Only admission is asserted. On 2026-11-06 the devnet admitted frame
 * transactions but bundled none, so the CLI waits 120 s for a receipt and
 * then stops with "admitted but not mined"; the exit code is not asserted.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { altMempoolActions, altMempoolDevnet } from "@evmcrispr/viem-frames";
import { createWalletClient, http, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BIN = join(import.meta.dirname, "../src/bin.ts");
const GATEWAY = "https://altmempoolgateway.forshtat.com/rpc";
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const run =
  process.env.EVMCRISPR_FRAME_DEVNET === "1" ? describe : describe.skip;

const SCRIPT = `load frame [tx]
switch 1337
tx (
  send ${RECIPIENT} --value 1e9
)
`;

run("frame:tx on the alt-mempool devnet", () => {
  test("a script run by the CLI is admitted by the alt mempool", async () => {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    const client = createWalletClient({
      account,
      chain: altMempoolDevnet,
      transport: http(undefined, { retryCount: 5 }),
    })
      .extend(publicActions)
      .extend(altMempoolActions());

    await client.requestFaucet(account.address);
    for (
      let i = 0;
      (await client.getBalance({ address: account.address })) === 0n;
      i++
    ) {
      if (i > 60) throw new Error("the faucet's transfer never arrived");
      await Bun.sleep(2_000);
    }

    const dir = mkdtempSync(join(tmpdir(), "evmcrispr-frame-"));
    try {
      const file = join(dir, "frame.evml");
      writeFileSync(file, SCRIPT);
      const proc = Bun.spawn(
        [
          "bun",
          BIN,
          "run",
          file,
          "--yes",
          "--size-by-simulation",
          "--experimental",
        ],
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
      const hash = output.match(/0x[0-9a-f]{64}/)?.[0];
      expect(hash).toBeDefined();
      console.log(
        `admitted: ${hash} (${altMempoolDevnet.blockExplorers?.default.url}, search the hash)`,
      );
      expect(output).not.toContain(key);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
