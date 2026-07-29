import "../../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";
import { FORK_BLOCK_NUMBER } from "../../../../../scripts/anvil-config";
import {
  fetchReleaseList,
  loadCompiler,
} from "../../../../contracts/src/utils/solcLoader";

const SRC =
  "pragma solidity 0.8.26; contract Counter { uint256 public n; function inc() public { n++; } }";
const OTHER_SRC =
  "pragma solidity 0.8.26; contract Other { uint256 public a; uint256 public b; function f() public { a = a + b + 7; } }";
const IMMUT_SRC =
  "pragma solidity 0.8.26; contract Immut { uint256 public immutable x; constructor(uint256 _x) { x = _x; } }";

const BACKENDS = [
  { name: "anvil", forkOpts: "--using anvil" },
  {
    name: "ethereumjs",
    // Pin to the anvil fork block — the EthereumJS backend forks from the
    // local anvil over RPC, which only serves the block it was launched at.
    forkOpts: `--using ethereumjs --block-number ${FORK_BLOCK_NUMBER}`,
  },
] as const;

// Pre-warm the compiler download (~9 MB on first use) so individual tests
// stay well inside the per-test timeout.
beforeAll(async () => {
  const { releases } = await fetchReleaseList();
  await loadCompiler(releases["0.8.26"]);
}, 120_000);

for (const backend of BACKENDS) {
  describe(`Sim > verify dry-run inside fork – ${backend.name}`, () => {
    let client: PublicClient;

    beforeAll(() => {
      client = getPublicClient();
    });

    function run(body: string) {
      const script = `load sim
load contracts
sim:fork ${backend.forkOpts} (
  sim:set-balance @me 100e18
${body}
)`;
      const interpreter = createInterpreter(script, client);
      const logs: string[] = [];
      interpreter.registerLogListener((m: string) => logs.push(m));
      return { done: interpreter.interpret(), logs };
    }

    it("verifies a matching deploy locally without Etherscan", async () => {
      const { done, logs } = run(
        `  contracts:deploy $c @contracts:solidity('${SRC}')
  contracts:verify $c --source @contracts:solidity.standardJson('${SRC}') --contract-name @contracts:solidity.contract('${SRC}') --compiler @contracts:solidity.compiler('${SRC}')`,
      );
      await done;
      expect(logs.some((m) => m.includes("would verify"))).toBe(true);
    });

    it("fails the dry-run when the source does not match the deployed code", async () => {
      const { done } = run(
        `  contracts:deploy $c @contracts:solidity('${SRC}')
  contracts:verify $c --source @contracts:solidity.standardJson('${OTHER_SRC}') --contract-name @contracts:solidity.contract('${OTHER_SRC}') --compiler @contracts:solidity.compiler('${OTHER_SRC}')`,
      );
      let caught: Error | undefined;
      try {
        await done;
      } catch (e: any) {
        caught = e;
      }
      expect(caught).not.toBeUndefined();
      expect(caught!.message).toContain("does not match");
    });

    it("masks immutables set by the constructor", async () => {
      const { done, logs } = run(
        `  contracts:deploy $c @contracts:solidity('${IMMUT_SRC}') --constructor "constructor(uint256)" --constructor-args [42]
  contracts:verify $c --source @contracts:solidity.standardJson('${IMMUT_SRC}') --contract-name @contracts:solidity.contract('${IMMUT_SRC}') --compiler @contracts:solidity.compiler('${IMMUT_SRC}')`,
      );
      await done;
      expect(logs.some((m) => m.includes("would verify"))).toBe(true);
    });
  });
}
