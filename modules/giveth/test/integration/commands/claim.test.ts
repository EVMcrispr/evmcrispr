import "../../setup";
import { afterAll } from "bun:test";
import {
  expect,
  resetAnvil,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeAbiParameters, keccak256, numberToHex } from "viem";
import { GIV, GIVPOWER_LM, TOKEN_DISTRO } from "../../fixtures";

// The sim:fork claim case leaves its state (a GIVstream allocation for the
// test account) on the shared anvil node; restore the pinned-block fork.
afterAll(async () => {
  await resetAnvil();
});

// TokenDistro on Gnosis keeps its balances mapping at slot 201 (probed
// on-chain by matching keccak(holder, slot) storage against
// balances(holder).allocatedTokens, 2026-07-20). The first struct field is
// allocatedTokens, so writing it grants a claimable GIVstream allocation.
const allocatedTokensSlot = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [TEST_ACCOUNT_ADDRESS, 201n],
  ),
);
const THOUSAND_GIV = numberToHex(1000n * 10n ** 18n, { size: 32 });

// The GardenUnipool keeps `mapping(address => uint256) rewards` at slot 111
// (probed on a scratch fork by writing keccak(holder, slot) and reading
// earned(holder) back, 2026-07-21; slot 2 is the staked-balance mapping and
// slot 110 is userRewardPerTokenPaid). Writing it grants pending staking
// rewards without touching stake state.
const rewardsSlot = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [TEST_ACCOUNT_ADDRESS, 111n],
  ),
);

describeCommand("claim", {
  describeName: "Giveth > commands > claim",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "does nothing when there is nothing to claim",
      script: "giveth:claim",
      validate: (actions) => {
        expect(actions).to.have.length(0);
      },
    },
    {
      name: "claims a GIVstream allocation inside sim:fork",
      timeout: 30000,
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 1e18
  sim:set-storage-at ${TOKEN_DISTRO} ${allocatedTokensSlot} ${THOUSAND_GIV}
  sim:expect @bool(@giveth:claimable(@me) > 0)
  giveth:claim
  sim:expect @bool(@giveth:claimable(@me) == 0)
)`,
      validate: () => {
        // Reaching this point means TokenDistro.claim() executed on the fork
        // without reverting and drained the claimable balance.
      },
    },
    {
      name: "harvests staking rewards without a redundant claim inside sim:fork",
      timeout: 30000,
      // getReward() allocates with the claim flag set, so TokenDistro sweeps
      // the released GIV inside the harvest tx itself. A follow-up claim()
      // finds claimableNow == 0 and reverts when no time has passed — which
      // is always the case on the fork, where consecutive blocks share a
      // timestamp (on-chain it only survives by claiming the dust released
      // between the two transactions).
      script: `load sim
load token
sim:fork --using anvil (
  sim:set-balance @me 1e18
  sim:set-storage-at ${GIVPOWER_LM} ${rewardsSlot} ${THOUSAND_GIV}
  sim:expect @bool(@giveth:claimable(@me) == 0)
  giveth:claim
  sim:expect @bool(@token:balance(${GIV} @me) > 0)
)`,
      validate: () => {
        // Reaching this point means the harvest ran as a single getReward()
        // that both allocated and claimed; the old trailing claim() would
        // have reverted with NOT_ENOUGH_TOKENS_TO_CLAIM.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on chains without a GIVstream deployment",
      script: "switch base\ngiveth:claim",
      error: "the GIVstream is not deployed on chain 8453",
    },
  ],
});
