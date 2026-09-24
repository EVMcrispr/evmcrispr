import "../../setup";
import { describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import { BindingsSpace, isTransactionAction } from "@evmcrispr/sdk";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { arbitrum, base, gnosis, mainnet, polygon } from "viem/chains";
import { getEndpoint } from "../../../../../scripts/anvil-config";
import { WRAPPED_NATIVE } from "../../../src/addresses";
import { cowTwap } from "../../../src/twap/cow";
import { TWAP_NETWORKS } from "../../../src/twap/networks";
import { findReference } from "../../../src/twap/reference";

describe("TWAP > five-network deployment and lifecycle smoke", () => {
  for (const chain of [mainnet, gnosis, polygon, base, arbitrum]) {
    it(`deploys, registers, cancels, recovers and reuses on ${chain.name}`, async () => {
      // An independent local node keeps multi-chain tests from resetting the
      // shared Gnosis fork under other suites. No transactions go upstream.
      const endpoint =
        process.env[`EVMCRISPR_RPC_URL_${chain.id}`] ?? getEndpoint(chain.id);
      if (!endpoint)
        throw new Error(
          `Set EVMCRISPR_RPC_URL_${chain.id} or VITE_DRPC_API_KEY for network smoke tests`,
        );
      const socket = createServer();
      await new Promise<void>((resolve) =>
        socket.listen(0, "127.0.0.1", resolve),
      );
      const port = (socket.address() as { port: number }).port;
      await new Promise<void>((resolve, reject) =>
        socket.close((err) => (err ? reject(err) : resolve())),
      );
      const node = Bun.spawn(
        [
          "anvil",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--chain-id",
          String(chain.id),
          "--fork-url",
          endpoint,
          "--silent",
        ],
        { stdout: "ignore", stderr: "ignore" },
      );
      const transport = http(`http://127.0.0.1:${port}`, {
        retryCount: 0,
        timeout: 2000,
      });
      const client = createPublicClient({ chain, transport });
      const account = mnemonicToAccount(
        "test test test test test test test test test test test junk",
        { addressIndex: 7 },
      );
      const wallet = createWalletClient({ chain, transport, account });
      try {
        let ready = false;
        for (let i = 0; i < 60; i++) {
          try {
            await client.getBlockNumber();
            ready = true;
            break;
          } catch {
            await Bun.sleep(500);
          }
        }
        if (!ready) throw new Error(`Local ${chain.name} fork failed to start`);
        expect(await client.getChainId()).toBe(chain.id);
        const run = async (source: string) => {
          const interpreter = new Interpreter(evml.registry, {
            account: account.address,
            transports: { [chain.id]: transport },
          });
          interpreter.switchChainId(chain.id);
          await interpreter.interpret(
            `load swaps\n${source}`,
            async (action) => {
              if (!isTransactionAction(action))
                throw new Error("Unexpected non-transaction action");
              const hash = await wallet.sendTransaction({
                to: action.to,
                data: action.data,
                value: action.value,
                gas: 5_000_000n,
              });
              const receipt = await client.waitForTransactionReceipt({ hash });
              expect(receipt.status).toBe("success");
              return receipt;
            },
          );
          return interpreter;
        };
        const create = `swaps:twap $order 2e18 ${WRAPPED_NATIVE[chain.id]} to ${TWAP_NETWORKS[chain.id].usdc} --parts 2 --every 300 --min 2 --offline true`;
        const readRef = (interpreter: Interpreter) =>
          findReference(
            client as any,
            chain.id,
            interpreter.bindingsManager.getBindingValue(
              "$order",
              BindingsSpace.USER,
            ),
          );
        const ref = await readRef(await run(`swaps:wrap 2e18\n${create}`));
        const status = await cowTwap.status(client as any, ref);
        expect(status.registered).toBe(true);
        expect(status.filled).toBe("none");
        expect(status.remainingSellBalance).toBe("2000000000000000000");
        const arg = ref.orderHash;
        await run(`swaps:twap-cancel ${arg}\nswaps:twap-recover ${arg}`);
        const recovered = await cowTwap.status(client as any, ref);
        expect(recovered.registered).toBe(false);
        expect(recovered.cancelled).toBe(true);
        expect(recovered.start).toBe(status.start);
        expect(recovered.remainingSellBalance).toBe("0");
        expect(recovered.allowance).toBe("0");
        expect((await readRef(await run(create))).account).toBe(ref.account);
      } finally {
        node.kill();
        await node.exited;
      }
    }, 180000);
  }
});
