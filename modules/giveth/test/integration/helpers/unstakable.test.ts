import "../../setup";
import { afterAll, describe, it } from "bun:test";
import {
  expect,
  getTransports,
  resetAnvil,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { describeHelper, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { encodeAbiParameters, keccak256, numberToHex } from "viem";
import { gnosis } from "viem/chains";
import { GIV } from "../../fixtures";

// GIV on Gnosis keeps its balances mapping at slot 3 (probed on-chain).
const givBalanceSlot = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [TEST_ACCOUNT_ADDRESS, 3n],
  ),
);
const THOUSAND_GIV = numberToHex(1000n * 10n ** 18n, { size: 32 });

describeHelper("@giveth:unstakable", {
  module: "giveth",
  cases: [
    {
      name: "returns 0 for an account that never staked",
      input: `@giveth:unstakable(${TEST_ACCOUNT_ADDRESS})`,
      validate: (result) => {
        expect((result as any).toBigInt()).to.eq(0n);
      },
    },
  ],
  docCases: [
    {
      description: "Print how much GIV you could unstake right now",
      code: 'print "Unstakable GIV:" @giveth:unstakable()',
    },
  ],
});

describeHelper("@giveth:unstakable", {
  describeName: "Giveth > helpers > @giveth:unstakable > other chains",
  module: "giveth",
  preamble: "switch mainnet",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails on chains without a GIVpower deployment",
      input: "@giveth:unstakable()",
      error: "GIVpower is not deployed on Ethereum",
    },
  ],
});

describe("Giveth > helpers > @giveth:unstakable > time-aware on a fork", () => {
  // sim:fork --using anvil resets the shared node and leaves the fork's
  // state behind; restore the pinned-block fork for later test files.
  afterAll(async () => {
    await resetAnvil();
  });

  it("tracks locks against the fork clock through stake/lock/wait", async () => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    // sim:expect assertions make the fork state the test oracle: staked
    // counts wrapped GIV, locking removes exactly the locked amount from
    // unstakable, and warping two rounds (lock was for one) frees it.
    // @lockable/@unlockable follow the contract's totalAmountLocked, which
    // keeps counting the ended lock until giveth:unlock runs, while
    // @unstakable follows the round clock.
    await evm.interpret(`load giveth
load sim
sim:fork --using anvil (
  sim:set-balance @me 10e18
  sim:set-storage-at ${GIV} ${givBalanceSlot} ${THOUSAND_GIV}
  set $lockRound @num(@giveth:round + 1)
  sim:expect @bool(@giveth:stakable() == 1000e18)
  giveth:stake 1000e18
  sim:expect @bool(@giveth:stakable() == 0)
  sim:expect @bool(@giveth:staked() == 1000e18)
  sim:expect @bool(@giveth:unstakable() == 1000e18)
  sim:expect @bool(@giveth:lockable() == 1000e18)
  giveth:lock 400e18 1
  sim:expect @bool(@giveth:staked() == 1000e18)
  sim:expect @bool(@giveth:unstakable() == 600e18)
  sim:expect @bool(@giveth:lockable() == 600e18)
  sim:expect @bool(@giveth:unlockable() == 0)
  wait 2419200
  sim:expect @bool(@giveth:unstakable() == 1000e18)
  sim:expect @bool(@giveth:lockable() == 600e18)
  sim:expect @bool(@giveth:unlockable() == 400e18)
  giveth:unlock $lockRound
  sim:expect @bool(@giveth:lockable() == 1000e18)
  sim:expect @bool(@giveth:unlockable() == 0)
)`);
  }, 30000);
});
