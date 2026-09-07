import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { CORE_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { installAssertionsCore } from "@evmcrispr/test-utils/onchain";
import { getAddress } from "viem";

/**
 * "Does this address have code", executed against the real contracts.
 *
 * This predicate used to be a command of its own (`assertions:assert-code`
 * / `assert-no-code`), which computed it the long way round:
 * `codehash != 0 && codehash != keccak256("")`, two comparisons over a
 * codehash read the param tree carried twice. It is now an assertion over
 * the code payload's length, and the two spellings must agree on all three
 * kinds of account — a contract, an existing account with no code, and an
 * account that does not exist at all — because that is the whole reason
 * the old form needed two comparisons.
 */

const WXDAI = getAddress("0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d");
/** Funded and nonce-bearing on the fork, but no code. */
const EOA = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
/** Never touched: zero nonce, zero balance, no code — codehash reads 0,
 *  not keccak256(""), which is the case a single comparison would miss. */
const NONEXISTENT = getAddress("0x00000000000000000000000000000000dead0001");

const preamble = "load lang\nload contracts";

/** Whether the assertion holds on-chain: assertParam reverts when it
 *  fails, so a successful eth_call IS the assertion passing. */
async function holds(expression: string): Promise<boolean> {
  const [action] = (await createInterpreter(
    `${preamble}\nassert ${expression}`,
    getPublicClient(),
  ).interpret()) as any[];
  try {
    await getPublicClient().call({ to: action.to, data: action.data });
    return true;
  } catch {
    return false;
  }
}

describe("Contracts > code presence (resolved)", () => {
  beforeAll(async () => {
    await installAssertionsCore(getPublicClient());
    // An eth_call to an address with NO code succeeds and returns empty,
    // so an uninstalled core would read as "every assertion passes" and
    // this suite would go green while testing nothing.
    const installed = await getPublicClient().getCode({
      address: CORE_ADDRESS,
    });
    expect(installed && installed !== "0x", "core not installed").to.be.true;
  }, 60_000);

  const cases: [string, `0x${string}`, boolean][] = [
    ["a contract", WXDAI, true],
    ["an existing account with no code", EOA, false],
    ["a nonexistent account", NONEXISTENT, false],
  ];

  for (const [what, address, hasCode] of cases) {
    it(`decides ${what}`, async () => {
      expect(await holds(`@bytes.len!(@codeAt!(${address})) > 0`)).to.equal(
        hasCode,
      );
      expect(await holds(`@bytes.len!(@codeAt!(${address})) == 0`)).to.equal(
        !hasCode,
      );
    }, 60_000);
  }
});
