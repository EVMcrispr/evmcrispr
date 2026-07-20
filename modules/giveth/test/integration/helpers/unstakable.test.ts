import "../../setup";
import { describe, it } from "bun:test";
import {
  expect,
  getTransports,
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
      error: "GIVpower is not deployed on chain 1",
    },
  ],
});

describe("Giveth > helpers > @giveth:unstakable > time-aware on a fork", () => {
  it("tracks locks against the fork clock through stake/lock/wait", async () => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    // sim:expect assertions make the fork state the test oracle: staked
    // counts wrapped GIV, locking removes exactly the locked amount from
    // unstakable, and warping two rounds (lock was for one) frees it.
    await evm.interpret(`load giveth
load sim
sim:fork --using anvil (
  sim:set-balance @me 10e18
  sim:set-storage-at ${GIV} ${givBalanceSlot} ${THOUSAND_GIV}
  giveth:stake 1000e18
  sim:expect @bool(@giveth:staked() == 1000e18)
  sim:expect @bool(@giveth:unstakable() == 1000e18)
  giveth:lock 400e18 1
  sim:expect @bool(@giveth:staked() == 1000e18)
  sim:expect @bool(@giveth:unstakable() == 600e18)
  wait 2419200
  sim:expect @bool(@giveth:unstakable() == 1000e18)
)`);
  }, 30000);
});
