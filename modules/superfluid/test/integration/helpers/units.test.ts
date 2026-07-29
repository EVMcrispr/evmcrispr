import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";

// Pool reads need a live pool, so every example creates one inside a fork.
describeHelper("@superfluid:units", {
  module: "superfluid",
  docCases: [
    {
      description: "Check a member's units after setting them",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 5 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  sim:expect @bool(@superfluid:units($pool 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) == 5)
)`,
      preamble: "load superfluid",
    },
  ],
});
