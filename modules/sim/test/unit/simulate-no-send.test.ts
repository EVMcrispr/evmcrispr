import "../setup";
import { describe, expect, it } from "bun:test";
import { isTransactionAction } from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { gnosis } from "viem/chains";
import { getForkBlockNumber } from "../../../../scripts/anvil-config";

// The assistant runs code only through `simulate`. It is given the code
// and an address to run from, never a wallet, so nothing it runs can be
// signed or sent: not a snippet wrapped in a fork, and not one that brings
// its own `sim:fork` and so is not wrapped, with a command outside it.

const FORK_BLOCK_NUMBER = await getForkBlockNumber();
const DEAD = "0x000000000000000000000000000000000000dEaD";
const FROM = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

const tag = evml.with({
  account: TEST_ACCOUNT_ADDRESS,
  chainId: gnosis.id,
  transports: getTransports(),
});

/** The node the tests run against, as a wallet would leave it changed:
 *  its height, and how many transactions each account has sent. */
async function node() {
  const client = getPublicClient();
  return {
    block: await client.getBlockNumber({ cacheTime: 0 }),
    from: await client.getTransactionCount({ address: FROM }),
    account: await client.getTransactionCount({
      address: TEST_ACCOUNT_ADDRESS,
    }),
  };
}

describe("Sim > a simulated snippet cannot send", () => {
  it("a snippet is wrapped in a fork: its transaction runs there and nowhere else", async () => {
    const before = await node();
    const result = await tag.script(`exec ${DEAD} "ping()"`).simulate({
      using: "ethereumjs",
      blockNumber: FORK_BLOCK_NUMBER,
      from: FROM,
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.actions.filter(isTransactionAction)).toHaveLength(1);
    expect(await node()).toEqual(before);
  });

  it("a snippet with its own sim:fork is not wrapped, and a transaction outside the fork is returned as data, not sent", async () => {
    const before = await node();
    const result = await tag
      .script(
        [
          "load sim",
          `sim:fork --using ethereumjs --block-number ${FORK_BLOCK_NUMBER} --from ${FROM} (`,
          "  print inside",
          ")",
          `exec ${DEAD} "ping()"`,
        ].join("\n"),
      )
      .simulate({ from: FROM });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.logs.join("\n")).toContain("inside");
    // The action that escaped the fork: described, and that is all.
    const [escaped, ...rest] = result.actions.filter(isTransactionAction);
    expect(rest).toEqual([]);
    expect(escaped.to?.toLowerCase()).toBe(DEAD.toLowerCase());
    expect(await node()).toEqual(before);
  });

  it("simulate takes no wallet", () => {
    const script = evml.script("print 1");
    const simulate = (options: Parameters<typeof script.simulate>[0]) =>
      options;
    // @ts-expect-error a wallet client is not an option of a simulation
    simulate({ walletClient: {} });
    // @ts-expect-error nor is a callback that would be handed its actions
    simulate({ onAction: async () => undefined });
    expect(script.simulate.length).toBeLessThanOrEqual(1);
  });
});
