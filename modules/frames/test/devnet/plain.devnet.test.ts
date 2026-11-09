// Live, opt-in (EVMCRISPR_FRAME_DEVNET=1): a plain sender's frame
// transaction, signed by a wallet that answers `eth_signTransaction` for type
// 0x06 (anvil account #0, as the test wallet will). On the quick devnet
// (`bun scripts/frame-devnet.ts up quick`), which never mines, it is
// admitted; on the mining devnet (`up mining`), mined.
import { describe, expect, it } from "bun:test";
import type { ModuleActionSendCtx } from "@evmcrispr/sdk";
import { parseFrameTransactionRequest } from "@evmcrispr/viem-frames";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, signTx } from "@forshtat/hegota-support/tx";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Hash,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { devAccounts } from "../../../../scripts/frame-devnet-config";
import { frameAction } from "../../src/actions";
import { chains } from "../../src/chains";
import { layoutFrames } from "../../src/layout";

const ENABLED = process.env.EVMCRISPR_FRAME_DEVNET === "1";
const DEAD = "0x000000000000000000000000000000000000dEaD";

describe.skipIf(!ENABLED)("a plain sender's frame transaction", () => {
  for (const [key, mines] of [
    ["framesQuick", false],
    ["framesMining", true],
  ] as const)
    it(`on the ${key} devnet is signed by its wallet through eth_signTransaction and ${mines ? "mined" : "admitted"}`, async () => {
      const quick = chains.find((c) => c.key === key)!;
      const node = http(quick.rpcUrl);
      // A devnet that never mines admits one transaction per sender (the
      // next nonce is refused until the first is mined): the first anvil
      // account with none pending.
      const reader = createPublicClient({ transport: node });
      let privateKey: `0x${string}` | undefined;
      for (const a of devAccounts()) {
        const [latest, pending] = await Promise.all(
          (["latest", "pending"] as const).map((blockTag) =>
            reader.getTransactionCount({ address: a.address, blockTag }),
          ),
        );
        if (latest === pending) {
          privateKey = a.privateKey;
          break;
        }
      }
      if (!privateKey)
        throw new Error(
          `every anvil account has a transaction pending on the ${quick.name}: restart it (frame-devnet.ts up quick)`,
        );
      const sender = privateKeyToAccount(privateKey).address;
      const asked: string[] = [];
      const wallet = createWalletClient({
        account: sender,
        transport: custom({
          async request({ method, params }: { method: string; params: any }) {
            asked.push(method);
            if (method === "eth_chainId") return `0x${quick.id.toString(16)}`;
            if (method === "eth_accounts") return [sender];
            if (method === "eth_signTransaction") {
              const tx = parseFrameTransactionRequest(params[0], profile);
              return encodeTx(profile, await signTx(profile, tx, privateKey));
            }
            throw new Error(`unexpected ${method}`);
          },
        }),
      });

      const action = frameAction.create({
        chainId: quick.id,
        from: sender,
        data: {
          frames: layoutFrames({
            actions: [{ to: DEAD, value: 1n, data: "0x", gas: 50_000n }],
            sender,
            chainId: quick.id,
          }),
          mempool: "canonical",
        },
      });
      const logs: string[] = [];
      const sent: Hash[] = [];
      const result = (await frameAction.send(action, {
        walletClient: wallet,
        getPublicClient: () => {
          throw new Error("not used");
        },
        transports: { [quick.id]: node },
        onLog: (line) => logs.push(line),
        onSent: (hash) => sent.push(hash),
      } as ModuleActionSendCtx)) as { transactionHash: Hash };
      console.log(logs.join("\n"));

      expect(asked).toContain("eth_signTransaction");
      expect(sent).toEqual([result.transactionHash]);
      const client = createPublicClient({ transport: node });
      const known = await client.request({
        method: "eth_getTransactionByHash",
        params: [result.transactionHash],
      });
      expect(known).not.toBeNull();
    }, 180_000);
});
