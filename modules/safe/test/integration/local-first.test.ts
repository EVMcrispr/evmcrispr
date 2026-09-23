import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evml } from "@evmcrispr/core";
import Handler141 from "@safe-global/safe-contracts/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json";
import Proxy141 from "@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json";
import Safe141 from "@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json";
import Handler150 from "@safe-global/safe-smart-account/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json";
import Proxy150 from "@safe-global/safe-smart-account/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json";
import Safe150 from "@safe-global/safe-smart-account/build/artifacts/contracts/Safe.sol/Safe.json";
import Safe130 from "safe-contracts-v1.3/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import Handler130 from "safe-contracts-v1.3/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json";
import Proxy130 from "safe-contracts-v1.3/build/artifacts/contracts/proxies/GnosisSafeProxy.sol/GnosisSafeProxy.json";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  type Hex,
  http,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { stringifySafeTransaction } from "../../src/utils/offline";
import { buildSafeTx, encodeExecTransaction } from "../../src/utils/safeTx";
import {
  mergeSafeSignables,
  messageSignable,
  nestedPayload,
  reviewSafeSignable,
  signableHashes,
  signableTypedData,
  transactionSignable,
} from "../../src/utils/signables";

const accounts = [0, 1, 2].map((addressIndex) =>
  mnemonicToAccount(
    "test test test test test test test test test test test junk",
    { addressIndex },
  ),
);
const abi = parseAbi([
  "function setup(address[],uint256,address,bytes,address,address,uint256,address)",
  "function nonce() view returns(uint256)",
  "function changeThreshold(uint256)",
  "function approveHash(bytes32)",
]);
let anvilProcess: ChildProcess;
let url: string;
let client: PublicClient;
let wallets: ReturnType<typeof createWalletClient>[];
beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  url = `http://127.0.0.1:${port}`;
  anvilProcess = spawn("anvil", ["--port", String(port), "--silent"], {
    stdio: "ignore",
  });
  client = createPublicClient({
    chain: anvil,
    transport: http(url, { retryCount: 0, timeout: 500 }),
    pollingInterval: 10,
  });
  wallets = accounts.map((account) =>
    createWalletClient({ chain: anvil, account, transport: http(url) }),
  );
  for (let i = 0; i < 100; i++) {
    try {
      await client.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  throw new Error("local Anvil did not start");
}, 15000);
afterAll(() => {
  anvilProcess?.kill();
});
evml.use({ name: "safe", load: () => import("../../src") });
async function receipt(hash: Hex) {
  const r = await client.waitForTransactionReceipt({ hash });
  expect(r.status).toBe("success");
  return r;
}
async function deploy(
  artifact: { abi: unknown; bytecode: string },
  args: unknown[] = [],
) {
  const hash = await wallets[0].deployContract({
    abi: artifact.abi as any,
    bytecode: artifact.bytecode as Hex,
    args,
    account: accounts[0],
    chain: anvil,
  });
  return (await receipt(hash)).contractAddress!;
}
async function send(to: Address, data: Hex, signer = 0) {
  return receipt(
    await wallets[signer].sendTransaction({
      to,
      data,
      account: accounts[signer],
      chain: anvil,
      gas: 2_000_000n,
    }),
  );
}
for (const [version, singletonArtifact, proxyArtifact, handlerArtifact] of [
  ["1.3.0", Safe130, Proxy130, Handler130],
  ["1.4.1", Safe141, Proxy141, Handler141],
  ["1.5.0", Safe150, Proxy150, Handler150],
] as const) {
  describe(`Safe ${version} local-first contracts`, () => {
    it("executes nested + EOA signatures, approvals and nonce replacements; rejects stale nested authorization and inner failures", async () => {
      const singleton = await deploy(singletonArtifact),
        handler = await deploy(handlerArtifact);
      const makeSafe = async (owners: Address[], threshold: bigint) => {
        const safe = await deploy(proxyArtifact, [singleton]);
        await send(
          safe,
          encodeFunctionData({
            abi,
            functionName: "setup",
            args: [
              owners,
              threshold,
              zeroAddress,
              "0x",
              handler,
              zeroAddress,
              0n,
              zeroAddress,
            ],
          }),
        );
        return safe;
      };
      const child = await makeSafe(
        [accounts[0].address, accounts[1].address],
        1n,
      );
      const parent = await makeSafe([child, accounts[1].address], 2n);
      const signable = transactionSignable(
        anvil.id,
        parent,
        buildSafeTx([{ to: accounts[2].address }], 0n),
      );
      const childMessage = messageSignable(
        anvil.id,
        child,
        nestedPayload(signable, version),
      );
      const childSigned = await mergeSafeSignables(childMessage, [
        await accounts[0].signTypedData(signableTypedData(childMessage)),
      ]);
      const signed = await mergeSafeSignables(signable, [
        childSigned,
        await accounts[1].signTypedData(signableTypedData(signable)),
      ]);
      const fetch = spyOn(globalThis, "fetch");
      const report = await reviewSafeSignable(signed, client);
      expect(report.ready).toBe(true);
      await evml
        .with({ chainId: anvil.id, transports: { [anvil.id]: http(url) } })
        .script(
          `load safe\nsafe:execute ${parent} ${JSON.stringify(stringifySafeTransaction(signed))}`,
        )
        .execute(wallets[2], { prepareChains: false });
      expect((await reviewSafeSignable(signed, client)).readiness).toBe(
        "nonce-consumed",
      );
      for (const [request] of fetch.mock.calls)
        expect(
          String(request instanceof Request ? request.url : request),
        ).toStartWith(url);
      fetch.mockRestore();

      // Raising the child threshold invalidates the previously sufficient child signature.
      const pending = transactionSignable(
        anvil.id,
        parent,
        buildSafeTx([{ to: accounts[2].address }], 1n),
      );
      const pendingMessage = messageSignable(
        anvil.id,
        child,
        nestedPayload(pending, version),
      );
      const pendingChild = await mergeSafeSignables(pendingMessage, [
        await accounts[0].signTypedData(signableTypedData(pendingMessage)),
      ]);
      const pendingSigned = await mergeSafeSignables(pending, [
        pendingChild,
        await accounts[1].signTypedData(signableTypedData(pending)),
      ]);
      const change = transactionSignable(
        anvil.id,
        child,
        buildSafeTx(
          [
            {
              to: child,
              data: encodeFunctionData({
                abi,
                functionName: "changeThreshold",
                args: [2n],
              }),
            },
          ],
          0n,
        ),
      );
      const changeSigned = await mergeSafeSignables(change, [
        await accounts[0].signTypedData(signableTypedData(change)),
      ]);
      const changeReport = await reviewSafeSignable(changeSigned, client);
      await send(
        child,
        encodeExecTransaction(
          child,
          (change as any).tx,
          changeReport.packedSignatures,
        ).data!,
      );
      // The child's one signature no longer meets its threshold: the child
      // Safe's approval is incomplete until another child owner signs.
      const stale = await reviewSafeSignable(pendingSigned, client);
      expect(stale.readiness).toBe("insufficient-signatures");
      expect(
        stale.signatures.find(
          (c) => c.owner.toLowerCase() === child.toLowerCase(),
        ),
      ).toMatchObject({
        type: "contract",
        status: "incomplete",
        progress: "1 of 2",
      });

      const approvalsSafe = await makeSafe(
        [accounts[0].address, accounts[1].address],
        2n,
      );
      const approved = transactionSignable(
        anvil.id,
        approvalsSafe,
        buildSafeTx([{ to: accounts[2].address }], 0n),
      );
      await send(
        approvalsSafe,
        encodeFunctionData({
          abi,
          functionName: "approveHash",
          args: [signableHashes(approved).finalHash],
        }),
      );
      const approvedSigned = await mergeSafeSignables(approved, [
        await accounts[1].signTypedData(signableTypedData(approved)),
      ]);
      expect((await reviewSafeSignable(approvedSigned, client)).ready).toBe(
        true,
      );
      const tag = evml.with({
        chainId: anvil.id,
        transports: { [anvil.id]: http(url) },
      });
      await tag
        .script(
          `load safe\nsafe:execute ${approvalsSafe} ${JSON.stringify(stringifySafeTransaction(approvedSigned))}`,
        )
        .execute(wallets[2], { prepareChains: false });
      expect((await reviewSafeSignable(approvedSigned, client)).readiness).toBe(
        "nonce-consumed",
      );

      // The Safe deliberately emits ExecutionFailure without reverting the outer receipt.
      const failedTx = {
        ...buildSafeTx(
          [
            {
              to: approvalsSafe,
              data: encodeFunctionData({
                abi,
                functionName: "changeThreshold",
                args: [0n],
              }),
            },
          ],
          1n,
        ),
        safeTxGas: 100000n,
      };
      const failed = transactionSignable(anvil.id, approvalsSafe, failedTx);
      const failedSigned = await mergeSafeSignables(
        failed,
        await Promise.all(
          accounts
            .slice(0, 2)
            .map((a) => a.signTypedData(signableTypedData(failed))),
        ),
      );
      await expect(
        tag
          .script(
            `load safe\nsafe:execute ${approvalsSafe} ${JSON.stringify(stringifySafeTransaction(failedSigned))} --allow-change-threshold-to 0`,
          )
          .execute(wallets[2], { prepareChains: false }),
      ).rejects.toThrow("ExecutionFailure");
      const original = transactionSignable(
        anvil.id,
        approvalsSafe,
        buildSafeTx([{ to: accounts[2].address }], 2n),
      );
      const replacement = transactionSignable(
        anvil.id,
        approvalsSafe,
        buildSafeTx([{ to: approvalsSafe }], 2n),
      );
      await send(
        approvalsSafe,
        encodeFunctionData({
          abi,
          functionName: "approveHash",
          args: [signableHashes(replacement).finalHash],
        }),
        1,
      );
      const directory = await mkdtemp(join(tmpdir(), "safe-cli-lifecycle-"));
      try {
        const output = join(directory, "signed.json");
        const outputFile = await open(output, "w");
        const source = `load safe\nload http\nsafe:propose-offline $tx ${approvalsSafe} (\n  send ${approvalsSafe} --value 0\n) --nonce 2\nset $review @safe:verify(${approvalsSafe} $tx)\nsign $sig --typed @http:json($review typedData)\nset $signed @safe:merge($tx $sig)\nprint $signed\nsafe:execute ${approvalsSafe} $signed\n`;
        const result = await new Promise<{
          code: number | null;
          stderr: string;
        }>((resolve, reject) => {
          const cli = spawn(
            "bun",
            [
              join(import.meta.dirname, "../../../../packages/cli/src/bin.ts"),
              "--experimental",
              "run",
              "-",
              "--wallet-rpc",
              url,
              "--account",
              accounts[0].address,
            ],
            {
              cwd: directory,
              env: {
                ...process.env,
                EVMCRISPR_DEFAULT_CHAIN_ID: String(anvil.id),
                EVMCRISPR_RPC_URL: url,
                [`EVMCRISPR_RPC_URL_${anvil.id}`]: url,
              },
              stdio: ["pipe", outputFile.fd, "pipe"],
            },
          );
          let stderr = "";
          cli.stderr!.on("data", (chunk) => {
            stderr += chunk;
          });
          cli.on("error", reject);
          cli.on("close", (code) => resolve({ code, stderr }));
          cli.stdin!.end(source);
        });
        await outputFile.close();
        expect(result.stderr).toContain("EIP-712 signing payload");
        expect(result.code).toBe(0);
        expect(JSON.parse(await readFile(output, "utf8")).safeTxHash).toBe(
          signableHashes(replacement).finalHash,
        );
        expect((await reviewSafeSignable(original, client)).readiness).toBe(
          "nonce-consumed",
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 30000);
  });
}
