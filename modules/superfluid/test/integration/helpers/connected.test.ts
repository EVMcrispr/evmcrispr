import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@superfluid:connected", {
  module: "superfluid",
  docCases: [
    {
      description: "Check pool membership before and after connecting",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:create-pool $pool xDAIx
  sim:expect @bool(@superfluid:connected($pool @me) == false)
  superfluid:connect-pool $pool
  sim:expect @superfluid:connected($pool @me)
)`,
      preamble: "load superfluid",
    },
  ],
});
