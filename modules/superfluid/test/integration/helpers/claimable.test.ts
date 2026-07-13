import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@superfluid:claimable", {
  module: "superfluid",
  docCases: [
    {
      description:
        "Earnings a disconnected member can claim after an instant distribution",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 2000e18
  superfluid:wrap 1000e18 into xDAIx
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  superfluid:distribute 400e18 xDAIx to $pool
  sim:expect @bool(@superfluid:claimable($pool 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) == 400e18)
)`,
      preamble: "load superfluid",
    },
  ],
});
