// Frame transactions simulated in sim:fork, on a fork of a frame network: a
// plain anvil started with the mining devnet's chain id (81412) stands in
// for it, so the frames' contracts run on the in-process backends.
import "../setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { Subprocess } from "bun";

const PORT = Number(process.env.EVMCRISPR_FRAMES_SIM_PORT ?? 8597);
process.env.EVMCRISPR_RPC_URL_81412 = `http://127.0.0.1:${PORT}`;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const FAILS = `exec 0x0000000000000000000000000000000000000001 "f()" --gas 1`;
const BACKENDS = ["ethereumjs", "revm"] as const;

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
    "load frames [tx new-account new-sponsor]",
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
}
