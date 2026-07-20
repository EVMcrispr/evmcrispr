import "../../setup";
import { afterAll } from "bun:test";
import {
  expect,
  resetAnvil,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeAbiParameters, keccak256, numberToHex } from "viem";
import { TOKEN_DISTRO } from "../../fixtures";

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
  ],
  errorCases: [
    {
      name: "should fail on chains without a GIVstream deployment",
      script: "switch base\ngiveth:claim",
      error: "the GIVstream is not deployed on chain 8453",
    },
  ],
});
