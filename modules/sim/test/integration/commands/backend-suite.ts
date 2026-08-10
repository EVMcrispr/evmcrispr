import { beforeAll, describe, expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";

import { getForkBlockNumber } from "../../../../../scripts/anvil-config";

const FORK_BLOCK_NUMBER = await getForkBlockNumber();

const ADDR = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const DEAD = "0x000000000000000000000000000000000000dEaD";
// Pin to the same block the local anvil is forked at — the in-process
// backends fork from anvil over RPC, and anvil only serves the block
// it was launched at (older blocks throw "Block N not found").
const BLOCK = FORK_BLOCK_NUMBER;

/**
 * Integration conformance suite for the in-process backends (ethereumjs,
 * revm): full `sim:fork --using <mode>` scripts through the interpreter
 * against the pinned-block anvil.
 */
export function describeIntegrationBackendSuite(
  mode: "ethereumjs" | "revm",
): void {
  const FORK_OPTS = `--using ${mode} --block-number ${BLOCK}`;

  function script(body: string): string {
    return `load sim\nload contracts\nload token\nsim:fork ${FORK_OPTS} (\n${body}\n)`;
  }

  function run(body: string, client: PublicClient) {
    const interpreter = createInterpreter(script(body), client);
    return interpreter.interpret();
  }

  describe(`${mode} backend – integration`, () => {
    let client: PublicClient;

    beforeAll(() => {
      client = getPublicClient();
    });

    // =========================================================================
    // A. Basic fork lifecycle
    // =========================================================================

    describe("A. Basic fork lifecycle", () => {
      it("fork completes with sim:expect true", async () => {
        await run("  sim:expect true", client);
      });

      it("fork without --block-number resolves latest block", async () => {
        const s = `load sim\nsim:fork --using ${mode} (\n  sim:expect true\n)`;
        const interpreter = createInterpreter(s, client);
        await interpreter.interpret();
      });

      it("fork with --from sets the connected account", async () => {
        const s = `load sim\nsim:fork --using ${mode} --block-number ${BLOCK} --from ${ADDR} (\n  sim:expect true\n)`;
        const interpreter = createInterpreter(s, client);
        await interpreter.interpret();
      });
    });

    // =========================================================================
    // B. State manipulation
    // =========================================================================

    describe("B. State manipulation", () => {
      it("set-balance and verify via @balance", async () => {
        await run(
          [
            `  sim:set-balance ${ADDR} 100e18`,
            `  sim:expect @bool(@balance(XDAI ${ADDR}) > 0)`,
          ].join("\n"),
          client,
        );
      });

      it("set-balance to zero", async () => {
        await run(
          [
            `  sim:set-balance ${ADDR} 0`,
            `  sim:expect @bool(@balance(XDAI ${ADDR}) == 0)`,
          ].join("\n"),
          client,
        );
      });

      it("set-code and verify via @contracts:codeAt", async () => {
        const bytecode = "0x600160005260206000f3";
        await run(
          [
            `  sim:set-code ${ADDR} ${bytecode}`,
            `  set $code @contracts:codeAt(${ADDR})`,
            `  sim:expect @bool(@str($code) == @str("${bytecode}"))`,
          ].join("\n"),
          client,
        );
      });

      it("set-storage-at and verify via @contracts:storageAt", async () => {
        const slot =
          "0x0000000000000000000000000000000000000000000000000000000000000001";
        const value =
          "0x00000000000000000000000000000000000000000000000000000000000000ff";
        await run(
          [
            `  sim:set-storage-at ${ADDR} ${slot} ${value}`,
            `  set $val @contracts:storageAt(${ADDR} ${slot})`,
            `  sim:expect @bool(@str($val) == @str("${value}"))`,
          ].join("\n"),
          client,
        );
      });
    });

    // =========================================================================
    // C. Time travel
    // =========================================================================

    describe("C. Time travel", () => {
      it("wait advances time without error", async () => {
        await run("  wait 3600", client);
      });

      it("multiple waits accumulate without error", async () => {
        await run(["  wait 3600", "  wait 7200"].join("\n"), client);
      });
    });

    // =========================================================================
    // D. Transaction execution
    // =========================================================================

    describe("D. Transaction execution", () => {
      it("reads a view function via @get (WXDAI name)", async () => {
        await run(
          [
            `  set $n @get(${WXDAI} "name()(string)")`,
            "  sim:expect true",
          ].join("\n"),
          client,
        );
      });

      it("executes a state-changing tx (approve)", async () => {
        await run(
          `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18 --from ${ADDR}`,
          client,
        );
      });

      it("executes multiple transactions in sequence", async () => {
        await run(
          [
            `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18 --from ${ADDR}`,
            `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 2e18 --from ${ADDR}`,
            `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 3e18 --from ${ADDR}`,
          ].join("\n"),
          client,
        );
      });

      it("reads state modified by a prior transaction (approve then check allowance)", async () => {
        await run(
          [
            `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18 --from ${ADDR}`,
            `  set $a @get(${WXDAI} "allowance(address,address)(uint256)" ${ADDR} ${DEAD})`,
            "  sim:expect @bool($a == 1e18)",
          ].join("\n"),
          client,
        );
      });
    });

    // =========================================================================
    // E. Combined scenarios
    // =========================================================================

    describe("E. Combined scenarios", () => {
      it("set-balance + deposit + verify WXDAI balance", async () => {
        await run(
          [
            `  sim:set-balance ${ADDR} 50e18`,
            `  exec ${WXDAI} "deposit()" --value 1e18 --from ${ADDR}`,
            `  set $b @get(${WXDAI} "balanceOf(address)(uint256)" ${ADDR})`,
            "  sim:expect @bool($b == 1e18)",
          ].join("\n"),
          client,
        );
      });

      it("set-balance + wait + balance persists", async () => {
        await run(
          [
            `  sim:set-balance ${ADDR} 10e18`,
            "  wait 86400",
            `  sim:expect @bool(@balance(XDAI ${ADDR}) > 0)`,
          ].join("\n"),
          client,
        );
      });

      it("many operations stress test", async () => {
        await run(
          [
            `  sim:set-balance ${ADDR} 1000e18`,
            `  sim:expect @bool(@balance(XDAI ${ADDR}) > 0)`,
            `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18 --from ${ADDR}`,
            "  wait 3600",
            `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 2e18 --from ${ADDR}`,
            "  wait 7200",
            `  exec ${WXDAI} "deposit()" --value 5e18 --from ${ADDR}`,
            `  set $b @get(${WXDAI} "balanceOf(address)(uint256)" ${ADDR})`,
            "  sim:expect @bool($b == 5e18)",
            `  exec ${WXDAI} "approve(address,uint256)" ${DEAD} 10e18 --from ${ADDR}`,
            `  set $a @get(${WXDAI} "allowance(address,address)(uint256)" ${ADDR} ${DEAD})`,
            "  sim:expect @bool($a == 10e18)",
            "  sim:expect true",
          ].join("\n"),
          client,
        );
      });
    });

    // =========================================================================
    // F. Error cases
    // =========================================================================

    describe("F. Error cases", () => {
      it("sim:expect false throws assertion error", async () => {
        await expect(run("  sim:expect false", client)).rejects.toThrow(
          "An assertion failed",
        );
      });

      it("sim:expect @bool(1 == 2) throws assertion error", async () => {
        await expect(run("  sim:expect @bool(1 == 2)", client)).rejects.toThrow(
          "An assertion failed",
        );
      });

      it("reverting transaction throws", async () => {
        await expect(
          run(
            `  exec ${WXDAI} "transfer(address,uint256)" ${DEAD} 999e18 --from ${ADDR}`,
            client,
          ),
        ).rejects.toThrow();
      });
    });
  });
}
