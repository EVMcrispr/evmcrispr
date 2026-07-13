import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@superfluid:distributionFlowrate", {
  module: "superfluid",
  docCases: [
    {
      description: "The rate a distributor streams into a pool",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 20000e18
  superfluid:wrap 10000e18 into xDAIx
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  superfluid:distribute-flow 1000e18/mo xDAIx to $pool
  print "Pool inflow:" @superfluid:distributionFlowrate(xDAIx @me $pool)
)`,
      preamble: "load superfluid",
    },
  ],
});
