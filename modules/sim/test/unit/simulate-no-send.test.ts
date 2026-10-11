import "../setup";
import { afterAll, describe, expect, it } from "bun:test";
import { isTransactionAction } from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { gnosis } from "viem/chains";
import {
  ensureAnvil,
  getForkBlockNumber,
  isAnvilRunning,
} from "../../../../scripts/anvil-config";

// The assistant runs code only through `simulate`. It is given the code
// and an address to run from, never a wallet, so nothing it runs can be
// signed or sent: not a snippet wrapped in a fork, and not one that brings
// its own `sim:fork` and so is not wrapped, with a command outside it.

// These tests read a node before and after, so they need one for as long
// as they run. The suite's preload only makes sure one is up when the
// process starts; when that process started it, it is stopped again as
// soon as the first test file ends, and this file can find nothing
// listening (which is how it failed under `bun test:unit` while passing
// alone). So this file makes sure of its node itself, and a test that
// loses it mid-way is run again from the start once it is back: nothing
// it asserts is relaxed.
const started: (ReturnType<typeof Bun.spawn> | undefined)[] = [
  await ensureAnvil(),
];
afterAll(() => {
  for (const anvil of started) anvil?.kill();
});

// A node that went away and came back is a fresh fork: it would look
// "unchanged" whatever had been sent to the one before it. So the node is
// marked (code at an address nothing else uses), the mark is part of what
// is compared, and a node that lost it is not the node the test began on.
const MARKER = "0x00000000000000000000000000000000005e7d1e";
const MARKED = "0x600160005260206000f3";
const mark = () =>
  getPublicClient().request({
    method: "anvil_setCode" as never,
    params: [MARKER, MARKED] as never,
  });
const marked = async () =>
  (await getPublicClient().getCode({ address: MARKER })) === MARKED;
await mark();

/** Runs `body` against one node from start to end. A failure while the
 *  node cannot be reached, or after it was replaced, is not a result: the
 *  node is brought back, marked, and `body` is run again, whole. Any
 *  other failure is the test's. */
async function withNode(body: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await body();
      // The node the test ended on is the one it began on.
      expect(await marked()).toBe(true);
      return;
    } catch (error) {
      const same =
        (await isAnvilRunning()) && (await marked().catch(() => false));
      if (attempt === 3 || same) throw error;
      started.push(await ensureAnvil());
      await mark();
    }
  }
}

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
  it("a snippet is wrapped in a fork: its transaction runs there and nowhere else", () =>
    withNode(async () => {
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
    }));

  it("a snippet with its own sim:fork is not wrapped, and a transaction outside the fork is returned as data, not sent", () =>
    withNode(async () => {
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
    }));

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
