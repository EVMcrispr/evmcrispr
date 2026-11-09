// Frame transactions simulated in sim:fork, on a fork of a frame network: a
// plain anvil started with the mining devnet's chain id (81412) stands in
// for it, so the frames' contracts run on the in-process backends.
import "../setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  COMPOSABLE_EXECUTOR_ADDRESS,
  COMPOSABLE_STORAGE_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { Subprocess } from "bun";
import { concat, getContractAddress, type Hex, pad } from "viem";
import composable from "../../../../packages/test-utils/src/onchain/fixtures/erc8211.json";

const PORT = Number(process.env.EVMCRISPR_FRAMES_SIM_PORT ?? 8597);
process.env.EVMCRISPR_RPC_URL_81412 = `http://127.0.0.1:${PORT}`;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const FAILS = `exec 0x0000000000000000000000000000000000000001 "f()" --gas 1`;
const BACKENDS = ["ethereumjs", "revm"] as const;
// SEVEN answers 7 to any call. BOX takes value, stores the word a call passes
// it, and answers that word to a call without arguments.
const SEVEN = "0x000000000000000000000000000000000000c0de";
const SEVEN_CODE = "0x60075f5260205ff3";
const BOX = "0x000000000000000000000000000000000000b0c5";
const BOX_CODE = "0x36600414600d576004355f55005b5f545f5260205ff3";
const BOX2 = "0x000000000000000000000000000000000000b0c6";
// Anvil's CREATE2 deployer (salt ++ init code), and init code that deploys SEVEN.
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
const SEVEN_INIT: Hex = `0x67${SEVEN_CODE.slice(2)}5f5260086018f3`;

let anvil: Subprocess | undefined;
beforeAll(async () => {
  anvil = Bun.spawn(
    ["anvil", "--chain-id", "81412", "--port", String(PORT), "--silent"],
    { stdout: "ignore", stderr: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    const up = await fetch(`http://127.0.0.1:${PORT}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
    }).catch(() => undefined);
    if (up?.ok) return;
    await Bun.sleep(100);
  }
  throw new Error("anvil did not start");
});
afterAll(() => anvil?.kill());

const run = async (using: string, body: string[]) => {
  const script = [
    "load sim",
    "load frames [tx verify default new-account new-sponsor]",
    `sim:fork --using ${using} --on 81412 (`,
    "  sim:set-balance @me 10e18",
    ...body.map((line) => `  ${line}`),
    ")",
  ].join("\n");
  const interpreter = createInterpreter(script, getPublicClient());
  const logs: string[] = [];
  interpreter.registerLogListener((line: string) => logs.push(line));
  await interpreter.interpret();
  return logs;
};

for (const using of BACKENDS) {
  describe(`Frames > simulated in sim:fork – ${using}`, () => {
    it("a frame account's transaction, paid by its sponsor, runs its body", async () => {
      await run(using, [
        "new-account $account --owner @me",
        "send $account --value 0.01e18",
        "new-sponsor $sponsor --for $account --fund 0.05e18",
        "tx --account $account --paymaster $sponsor (",
        `  send ${DEAD} --value 1000 --gas 50000`,
        ")",
        `sim:expect @bool(@balance(ETH ${DEAD}) == 1000)`,
      ]);
    }, 120_000);

    it("a plain sender's transaction runs, and a call without --gas says what it used", async () => {
      const logs = await run(using, [
        "tx (",
        `  send ${DEAD} --value 7`,
        ")",
        `sim:expect @bool(@balance(ETH ${DEAD}) == 7)`,
      ]);
      expect(logs.join("\n")).toMatch(
        /Frame 2 used \d+ gas: give its call --gas \d+ to send it/,
      );
    }, 120_000);

    it("a failed frame does not stop the next ones; a failed atomic group rolls back", async () => {
      const logs = await run(using, [
        "tx (",
        `  send ${DEAD} --value 7 --gas 30000`,
        `  ${FAILS}`,
        `  send ${DEAD} --value 3 --gas 30000`,
        "  batch (",
        `    send ${DEAD} --value 100 --gas 30000`,
        `    ${FAILS}`,
        `    send ${DEAD} --value 200 --gas 30000`,
        "  )",
        ")",
        `sim:expect @bool(@balance(ETH ${DEAD}) == 10)`,
      ]);
      const text = logs.join("\n");
      expect(text).toContain("Frame 3 reverted");
      expect(text).toContain("Frame 5 reverted");
      expect(text).toContain("Frame 6 reverted");
      expect(text).toContain("Frame 7 skipped");
    }, 120_000);

    it("a smart batch in a frame account's transaction runs through its ERC-7579 executor, atomically", async () => {
      await run(using, [
        `sim:set-code ${COMPOSABLE_EXECUTOR_ADDRESS} ${composable.executor}`,
        `sim:set-code ${COMPOSABLE_STORAGE_ADDRESS} ${composable.storage}`,
        "new-account $account --owner @me",
        "send $account --value 0.01e18",
        "tx --account $account --gas 200000 (",
        `  exec $account "installModule(uint256,address,bytes)" 2 ${COMPOSABLE_EXECUTOR_ADDRESS} @bytes("" utf8)`,
        ")",
        "tx --account $account --gas 300000 (",
        "  batch !(",
        `    send ${DEAD} --value 5`,
        `    send ${DEAD} --value 6`,
        "  )",
        ")",
        `sim:expect @bool(@balance(ETH ${DEAD}) == 11)`,
      ]);
    }, 120_000);

    it("a smart batch in a frame account's transaction passes a captured return value to a later call", async () => {
      await run(using, [
        `sim:set-code ${COMPOSABLE_EXECUTOR_ADDRESS} ${composable.executor}`,
        `sim:set-code ${COMPOSABLE_STORAGE_ADDRESS} ${composable.storage}`,
        `sim:set-code ${SEVEN} ${SEVEN_CODE}`,
        `sim:set-code ${BOX} ${BOX_CODE}`,
        "new-account $account --owner @me",
        "send $account --value 0.01e18",
        "tx --account $account --gas 200000 (",
        `  exec $account "installModule(uint256,address,bytes)" 2 ${COMPOSABLE_EXECUTOR_ADDRESS} @bytes("" utf8)`,
        ")",
        "tx --account $account --gas 400000 (",
        "  batch !(",
        `    exec ${SEVEN} "seven() returns (uint256)" -> [$seven]`,
        `    exec ${BOX} "put(uint256)" $seven`,
        "  )",
        ")",
        `sim:expect @bool(@get(${BOX} "get()(uint256)") == 7)`,
      ]);
    }, 120_000);

    it("a smart batch from a plain sender is refused: it needs an ERC-7579 account", async () => {
      await expect(
        run(using, [
          "tx --gas 300000 (",
          "  batch !(",
          `    send ${DEAD} --value 5`,
          "  )",
          ")",
        ]),
      ).rejects.toThrow(
        "A smart batch (batch !(...)) runs through an ERC-7579 account: send the frame transaction from one with --account",
      );
    }, 120_000);

    it("a sponsor of another account refuses, and the transaction is invalid", async () => {
      await expect(
        run(using, [
          "new-account $account --owner @me",
          "new-account $other --owner @me --salt 1",
          "new-sponsor $sponsor --for $other --fund 0.05e18",
          "tx --account $account --paymaster $sponsor (",
          `  send ${DEAD} --value 1 --gas 50000`,
          ")",
        ]),
      ).rejects.toThrow(
        /The frame transaction is invalid: frame 2 \(verify to 0x[0-9a-fA-F]{40}\) failed/,
      );
    }, 120_000);
  });

  // The frame layouts of forshtat/hegota-demo that EVMcrispr writes today,
  // without the demo's POST_TX assertion frames (not run here). Not covered:
  // an account created in the transaction that verifies it, and a contract
  // sender with its own verify and nonce keys (the shielded pool's swap).
  describe(`Frames > hegota-demo layouts – ${using}`, () => {
    it("a plain sender approves itself and calls an executor from a default frame (the attack scenarios)", async () => {
      await run(using, [
        `sim:set-code ${BOX} ${BOX_CODE}`,
        "tx (",
        "  verify @me --approve both",
        "  default (",
        `    exec ${BOX} "execute(uint256)" 7 --gas 50000`,
        "  )",
        ")",
        `sim:expect @bool(@get(${BOX} "get()(uint256)") == 7)`,
      ]);
    }, 120_000);

    it("a plain sender shields value into a pool from a sender frame (the shielded pool's deposit)", async () => {
      await run(using, [
        `sim:set-code ${BOX} ${BOX_CODE}`,
        "tx (",
        `  exec ${BOX} "shield(uint256)" 42 --value 1000 --gas 50000`,
        ")",
        `sim:expect @bool(@get(${BOX} "get()(uint256)") == 42)`,
        `sim:expect @bool(@balance(ETH ${BOX}) == 1000)`,
      ]);
    }, 120_000);

    it("an owner deploys a contract through a factory from a default frame (the Safe provisioning)", async () => {
      const salt = pad("0x5afe");
      const deployed = getContractAddress({
        opcode: "CREATE2",
        from: CREATE2_DEPLOYER,
        salt,
        bytecode: SEVEN_INIT,
      });
      await run(using, [
        "tx (",
        "  verify @me --approve both",
        "  default (",
        `    send ${CREATE2_DEPLOYER} --data ${concat([salt, SEVEN_INIT])} --gas 200000`,
        "  )",
        ")",
        `sim:expect @bool(@get(${deployed} "seven()(uint256)") == 7)`,
      ]);
    }, 120_000);

    it("a frame account approves itself, runs two default frames and pays for them (the account funding)", async () => {
      await run(using, [
        `sim:set-code ${BOX} ${BOX_CODE}`,
        `sim:set-code ${BOX2} ${BOX_CODE}`,
        "new-account $account --owner @me",
        "send $account --value 0.01e18",
        "tx --account $account --max-fee-per-gas 50e9 --max-priority-fee-per-gas 1e9 (",
        "  default (",
        `    exec ${BOX} "mint(uint256)" 100 --gas 50000`,
        `    exec ${BOX2} "executeAction(uint256)" 9 --gas 50000`,
        "  )",
        ")",
        `sim:expect @bool(@get(${BOX} "get()(uint256)") == 100)`,
        `sim:expect @bool(@get(${BOX2} "get()(uint256)") == 9)`,
        "sim:expect @bool(@balance(ETH $account) < 0.01e18)",
      ]);
    }, 120_000);

    it("a sponsor pays the fee of the account it sponsors, and the account pays nothing", async () => {
      await run(using, [
        `sim:set-code ${BOX} ${BOX_CODE}`,
        "new-account $account --owner @me",
        "send $account --value 0.01e18",
        "new-sponsor $sponsor --for $account --fund 0.05e18",
        "tx --account $account --paymaster $sponsor --max-fee-per-gas 50e9 (",
        `  exec ${BOX} "put(uint256)" 5 --gas 50000`,
        ")",
        `sim:expect @bool(@get(${BOX} "get()(uint256)") == 5)`,
        "sim:expect @bool(@balance(ETH $account) == 0.01e18)",
        "sim:expect @bool(@balance(ETH $sponsor) < 0.05e18)",
      ]);
    }, 120_000);

    it("a frame transaction whose payer cannot pay its fee is invalid", async () => {
      await expect(
        run(using, [
          "new-account $account --owner @me",
          "send $account --value 1000",
          "tx --account $account --max-fee-per-gas 50e9 (",
          `  send ${DEAD} --value 1 --gas 50000`,
          ")",
        ]),
      ).rejects.toThrow(
        /The frame transaction is invalid: 0x[0-9a-fA-F]{40} cannot pay the fee/,
      );
    }, 120_000);
  });
}
