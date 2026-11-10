// Frame transactions simulated in sim:fork on a fork of the Hegota devnet:
// a plain anvil started with its chain id (3151908) stands in for it, so
// the fork applies that network's profile and gas rules. What each case
// expects was measured on the Hegota devnet itself (2026-11-09).
import "../setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { Subprocess } from "bun";
import { concat, getContractAddress, type Hex, pad } from "viem";

const PORT = Number(process.env.EVMCRISPR_FRAMES_HEGOTA_SIM_PORT ?? 8598);
// The stand-in replaces the declared public node for its id; its block 0 is
// not Hegota's, so it is a local devnet of that family (same rules).
process.env.EVMCRISPR_RPC_URL_3151908 = `http://127.0.0.1:${PORT}`;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const BACKENDS = ["ethereumjs", "revm"] as const;
// BOX takes value, stores the word a call passes it, and answers it to a
// call without arguments.
const BOX = "0x000000000000000000000000000000000000b0c5";
const BOX_CODE = "0x36600414600d576004355f55005b5f545f5260205ff3";
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
const SEVEN_INIT: Hex = "0x6760075f5260205ff35f5260086018f3";
// Reverts unless TXTRACE(param, index) >= minimum, read after a selector
// (`check(uint256 param, uint256 index, uint256 minimum)`); the index is
// TXTRACE's top operand on the Hegota devnet.
const AT_LEAST = "0x00000000000000000000000000000000000c4ec5";
const AT_LEAST_CODE = "0x600435602435b660443511156012575f5ffd5b00";
// The deployer reverts when the init code it runs reverts.
const REVERTS = `exec ${CREATE2_DEPLOYER} "f()" --gas 100000`;

let anvil: Subprocess | undefined;
beforeAll(async () => {
  anvil = Bun.spawn(
    ["anvil", "--chain-id", "3151908", "--port", String(PORT), "--silent"],
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
    "load frames [tx verify default new-account new-sponsor post-verify]",
    `sim:fork --using ${using} --on hegotaDevnet (`,
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
  describe(`Frames > on the Hegota devnet – ${using}`, () => {
    it("the demo's layouts run: a default call, a sender frame with value, a deploy through a factory", async () => {
      const salt = pad("0x5afe");
      const deployed = getContractAddress({
        opcode: "CREATE2",
        from: CREATE2_DEPLOYER,
        salt,
        bytecode: SEVEN_INIT,
      });
      await run(using, [
        `sim:set-code ${BOX} ${BOX_CODE}`,
        "tx (",
        "  verify @me --approve both",
        "  default (",
        `    exec ${BOX} "execute(uint256)" 7 --gas 50000`,
        `    send ${CREATE2_DEPLOYER} --data ${concat([salt, SEVEN_INIT])} --gas 200000`,
        "  )",
        `  send ${DEAD} --value 1000 --gas 50000`,
        ")",
        `sim:expect @bool(@get(${BOX} "get()(uint256)") == 7)`,
        `sim:expect @bool(@get(${deployed} "seven()(uint256)") == 7)`,
        `sim:expect @bool(@balance(ETH ${DEAD}) == 1000)`,
      ]);
    }, 120_000);

    it("a frame to a precompile or a codeless account runs with 1 gas and uses none of it", async () => {
      const logs = await run(using, [
        "tx (",
        `  exec 0x0000000000000000000000000000000000000001 "f()" --gas 1`,
        `  send ${DEAD} --value 3 --gas 1`,
        ")",
        `sim:expect @bool(@balance(ETH ${DEAD}) == 3)`,
      ]);
      expect(logs.join("\n")).not.toMatch(/Frame \d (reverted|skipped)/);
    }, 120_000);

    it("a reverting frame fails alone; an atomic group rolls back as a whole", async () => {
      const logs = await run(using, [
        "tx (",
        `  send ${DEAD} --value 1 --gas 50000`,
        `  ${REVERTS}`,
        `  send ${DEAD} --value 2 --gas 50000`,
        "  batch (",
        `    send ${DEAD} --value 100 --gas 50000`,
        `    ${REVERTS}`,
        "  )",
        ")",
        // 1 + 2: the group's 100 was undone with it.
        `sim:expect @bool(@balance(ETH ${DEAD}) == 3)`,
      ]);
      const text = logs.join("\n");
      expect(text).toContain("Frame 3 reverted");
      // The group's first frame keeps its status, as the chain reports it.
      expect(text).toContain("Frame 5 was rolled back with its atomic group");
      expect(text).toContain("Frame 6 reverted");
    }, 120_000);

    it("a sender that gives fees pays for the frames' gas", async () => {
      await run(using, [
        `sim:set-code ${BOX} ${BOX_CODE}`,
        "set $before @balance(ETH @me)",
        "tx --max-fee-per-gas 50e9 (",
        `  exec ${BOX} "put(uint256)" 5 --gas 50000`,
        ")",
        `sim:expect @bool(@get(${BOX} "get()(uint256)") == 5)`,
        "sim:expect @bool(@balance(ETH @me) < $before)",
      ]);
    }, 120_000);

    it("a post-verify check reads the transaction's trace; one that holds keeps the body", async () => {
      await run(using, [
        `sim:set-code ${AT_LEAST} ${AT_LEAST_CODE}`,
        "tx (",
        `  send ${DEAD} --value 1 --gas 50000`,
        "  post-verify (",
        // BALANCE_COUNT >= 2: the sender and the recipient.
        `    exec ${AT_LEAST} "check(uint256,uint256,uint256)" 0 0 2 --gas 100000`,
        "  )",
        ")",
        `sim:expect @bool(@balance(ETH ${DEAD}) == 1)`,
      ]);
    }, 120_000);

    it("a post-verify check that fails stops the run, as a send would, naming it", async () => {
      await expect(
        run(using, [
          `sim:set-code ${AT_LEAST} ${AT_LEAST_CODE}`,
          "tx (",
          `  send ${DEAD} --value 1 --gas 50000`,
          "  post-verify (",
          // STORAGE_COUNT >= 1: nothing was written.
          `    exec ${AT_LEAST} "check(uint256,uint256,uint256)" 1 0 1 --gas 100000`,
          "  )",
          ")",
        ]),
      ).rejects.toThrow(
        "A post-verify check failed: the check on line 9 reverted, so the transaction's body was reverted",
      );
    }, 120_000);
  });
}
